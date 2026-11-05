import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiErrorCode, apiErrorOutcome } from '../../../core/api/api-error';
import { ChatApi } from '../../../core/api/chat.api';
import type { ChatMessage, MessagePage } from '../../../core/api/chat.types';
import { ProjectsApi } from '../../../core/api/projects.api';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { SessionService } from '../../../core/session/session.service';
import { Button } from '../../../shared/ui/button/button';
import { Empty } from '../../../shared/ui/empty/empty';
import { Field, FieldTextarea } from '../../../shared/ui/field/field';
import { Notice } from '../../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { ProjectTabs } from '../project-tabs/project-tabs';
import { ChatMessageRow } from './chat-message';
import { type PendingMessage, buildTimeline, mergeMessages } from './chat-timeline';

/** Hasta esta distancia del fondo se considera que la persona está abajo. */
const BOTTOM_TOLERANCE_PX = 32;

/** El máximo que acepta el backend: un hueco grande se recorre en menos peticiones. */
const CATCH_UP_BLOCK = 100;

const isVisible = (): boolean => document.visibilityState === 'visible';

/**
 * La conversación de un proyecto. Quien no es miembro recibe la pantalla de no
 * encontrado, igual que en el detalle. La coordinación ve el proyecto pero no
 * participa de su chat: el backend le responde 403 y la pantalla la manda al detalle.
 */
@Component({
  selector: 'app-project-chat',
  imports: [
    Button,
    ChatMessageRow,
    Empty,
    Field,
    FieldTextarea,
    LoadingStatus,
    Notice,
    ProjectTabs,
    RouterLink,
    Skeleton,
  ],
  templateUrl: './project-chat.html',
  styleUrl: './project-chat.css',
  host: { '(document:visibilitychange)': 'onScroll()' },
})
export class ProjectChat {
  readonly #router = inject(Router);
  readonly #injector = inject(Injector);
  readonly #chat = inject(ChatApi);
  readonly #projects = inject(ProjectsApi);
  readonly #session = inject(SessionService);
  readonly #realtime = inject(RealtimeService);

  readonly #params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });
  protected readonly projectId = computed(() => this.#params().get('projectId') ?? '');

  // `private` de TypeScript: `viewChild` no admite los campos privados de ES.
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');

  protected readonly project = resource({
    params: () => this.projectId(),
    loader: ({ params }) => this.#projects.get(params),
  });

  /** Un proyecto ajeno y una URL rota son la misma pantalla: ver el detalle. */
  protected readonly notFound = computed(() => {
    const code = apiErrorCode(this.project.error());

    return code === 'NOT_FOUND' || code === 'VALIDATION_ERROR';
  });

  protected readonly closed = computed(
    () => this.project.hasValue() && this.project.value().status === 'COMPLETED',
  );

  // El historial.
  protected readonly messages = signal<readonly ChatMessage[]>([]);
  protected readonly loading = signal(true);
  protected readonly hasOlder = signal(false);
  protected readonly loadingOlder = signal(false);
  protected readonly historyError = signal<string | null>(null);

  // Lo que se está enviando.
  protected readonly pending = signal<readonly PendingMessage[]>([]);
  protected readonly draft = signal('');
  #nextLocalId = 0;
  /**
   * El provisional que salió del compositor con el texto que sigue escrito ahí. Si
   * falla, volver a enviar lo reintenta en vez de crear otro; si la persona cambia
   * el texto, los dos ya son cosas distintas y el vínculo se suelta.
   */
  readonly #composerId = signal<number | null>(null);

  /**
   * Desde dónde hay que ponerse al día, o `null` si el historial es continuo. Se fija
   * al caerse la conexión y no al volver: un mensaje propio enviado por REST mientras
   * el socket estaba caído queda al final de la lista, con un agujero detrás.
   */
  #resumeFrom: string | null = null;
  /** Cada recuperación deja sin efecto a la anterior. */
  #catchUpRun = 0;
  /** El último mensaje marcado: mandar otra vez el mismo no aporta nada. */
  #lastMarkedId: string | null = null;
  /** Cada marca deja sin efecto la respuesta de la anterior, que pudo llegar después. */
  #markRun = 0;

  protected readonly timeline = computed(() =>
    buildTimeline(this.messages(), this.pending(), this.#session.user()),
  );

  protected readonly online = computed(() => this.#realtime.presenceIn(this.projectId()));

  protected readonly sending = computed(() =>
    this.pending().some((m) => m.localId === this.#composerId() && m.status === 'sending'),
  );

  protected readonly canSend = computed(
    () => !this.closed() && !this.sending() && this.draft().trim() !== '',
  );

  constructor() {
    effect(() => {
      this.projectId();

      untracked(() => this.#open());
    });

    this.#realtime.chatMessages.pipe(takeUntilDestroyed()).subscribe((message) => {
      if (message.projectId === this.projectId()) {
        this.#addMessages([message]);
      }
    });

    this.#realtime.disconnected.pipe(takeUntilDestroyed()).subscribe(() => {
      this.#resumeFrom ??= this.messages().at(-1)?.id ?? null;
    });

    // Durante la desconexión pudieron llegar mensajes que el socket nunca entregó. La
    // primera carga ya pide lo último: aquí no hay nada que recuperar todavía.
    this.#realtime.connected.pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.loading()) {
        this.reload();
      }
    });

    inject(DestroyRef).onDestroy(() => this.#catchUpRun++);
  }

  protected isOnline(userId: string): boolean {
    return this.online()?.has(userId) ?? false;
  }

  /** Sigue desde donde quedó, si ya había historial; si no, pide lo último. */
  protected reload(): void {
    const from = this.#resumeFrom ?? this.messages().at(-1)?.id;

    void (from ? this.#catchUp(from) : this.#loadLatest());
  }

  /**
   * Llegar al fondo es haber leído lo que había: sin esto, la cifra no bajaría nunca.
   * También al volver a la pestaña: mientras estuvo oculta no se marcó nada, y el
   * fondo se mide ahora, no con un valor de cuando se fue.
   */
  protected onScroll(): void {
    if (this.#atBottom()) {
      void this.#markLatest();
    }
  }

  /** Lo que estaba leyendo la persona se queda donde estaba: el bloque crece por arriba. */
  protected async loadOlder(): Promise<void> {
    const projectId = this.projectId();
    const oldest = this.messages()[0];

    if (!oldest || this.loadingOlder()) {
      return;
    }

    this.loadingOlder.set(true);

    try {
      const page = await this.#chat.list(projectId, { antes: oldest.id });

      // La ruta pudo cambiar a otro proyecto mientras tanto.
      if (this.messages()[0]?.id !== oldest.id) {
        return;
      }

      const element = this.scroller()?.nativeElement;
      const height = element?.scrollHeight ?? 0;
      const top = element?.scrollTop ?? 0;

      this.messages.update((current) => mergeMessages(current, page.messages));
      this.hasOlder.set(page.nextCursor !== null);
      this.historyError.set(null);

      afterNextRender(
        () => {
          if (element) {
            element.scrollTop = top + element.scrollHeight - height;
          }
        },
        { injector: this.#injector },
      );
    } catch (error) {
      this.#showHistoryError(error);
    } finally {
      this.loadingOlder.set(false);
    }
  }

  protected onDraftInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
    this.#composerId.set(null);
  }

  /** Enter envía y Shift+Enter hace salto: este evento solo llega sin modificadores. */
  protected onEnter(event: Event): void {
    // La tecla que confirma una composición (IME) no es un envío.
    if (!(event as KeyboardEvent).isComposing) {
      event.preventDefault();
      void this.send();
    }
  }

  protected async send(): Promise<void> {
    if (!this.canSend()) {
      return;
    }

    const retrying = this.pending().find((m) => m.localId === this.#composerId());

    if (retrying) {
      await this.retry(retrying);
      return;
    }

    const message: PendingMessage = {
      localId: this.#nextLocalId++,
      content: this.draft().trim(),
      createdAt: new Date().toISOString(),
      status: 'sending',
      error: null,
    };

    this.#composerId.set(message.localId);
    this.pending.update((current) => [...current, message]);
    this.#scrollToBottom();

    await this.#deliver(message);
  }

  protected async retry(message: PendingMessage): Promise<void> {
    this.#updatePending(message.localId, { status: 'sending', error: null });

    await this.#deliver(message);
  }

  /**
   * Quita el provisional e inserta el real. El evento puede haber llegado antes que
   * esta respuesta: entonces su id ya está, insertarlo no hace nada y el provisional
   * se va igual. Nunca se comparan textos.
   */
  async #deliver({ localId, content }: PendingMessage): Promise<void> {
    const projectId = this.projectId();

    try {
      const message = await this.#chat.send(projectId, content);

      this.pending.update((current) => current.filter((m) => m.localId !== localId));
      this.#addMessages([message]);

      if (this.#composerId() === localId) {
        this.#composerId.set(null);
        this.draft.set('');
        this.composer()?.nativeElement.focus();
      }
    } catch (error) {
      const outcome = apiErrorOutcome(error);

      this.#updatePending(localId, {
        status: 'failed',
        error:
          outcome.kind === 'fields'
            ? (outcome.fields['content'] ?? outcome.message)
            : outcome.kind === 'message'
              ? outcome.message
              : null,
      });
    }
  }

  #updatePending(localId: number, change: Partial<PendingMessage>): void {
    this.pending.update((current) =>
      current.map((m) => (m.localId === localId ? { ...m, ...change } : m)),
    );
  }

  #open(): void {
    this.#catchUpRun++;
    this.#resumeFrom = null;
    this.#lastMarkedId = null;
    this.messages.set([]);
    this.pending.set([]);
    this.draft.set('');
    this.#composerId.set(null);
    this.hasOlder.set(false);
    this.historyError.set(null);
    this.loading.set(true);

    void this.#loadLatest();
  }

  /**
   * El bloque más reciente, al abrir. Es contiguo por sí mismo, y lo que llegó por el
   * socket mientras viajaba es más nuevo. La marca de lectura da la cifra; después de
   * eso, la vista queda al fondo y lo que se ve ya está leído.
   */
  async #loadLatest(): Promise<void> {
    const projectId = this.projectId();

    try {
      const [page, state] = await Promise.all([
        this.#chat.list(projectId),
        this.#chat.readState(projectId).catch(() => null),
      ]);

      if (projectId !== this.projectId()) {
        return;
      }

      if (state) {
        this.#realtime.setUnread(projectId, state.unreadCount);
      }

      this.messages.update((current) => mergeMessages(current, page.messages));
      this.hasOlder.set(page.nextCursor !== null);
      this.historyError.set(null);
      this.#scrollToBottom();
      void this.#markLatest();
    } catch (error) {
      // El backend es quien sabe que la coordinación no participa.
      if (apiErrorCode(error) === 'FORBIDDEN') {
        void this.#router.navigate(['/proyectos', projectId], { replaceUrl: true });
        return;
      }

      this.#showHistoryError(error);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Pide lo que vino después y sigue hasta que el servidor diga que no queda nada. Lo
   * que había no se toca, por grande que sea el hueco: se recupera entero.
   *
   * Lo que llega por el socket mientras tanto entra por su lado y también viene en
   * algún bloque: `mergeMessages` une por id, así que da igual cuál llegue primero. El
   * cursor sale de la respuesta y nunca de la lista, donde ese mensaje suelto haría
   * saltar el agujero. Si algo falla, `#resumeFrom` guarda por dónde iba.
   */
  async #catchUp(from: string): Promise<void> {
    const run = ++this.#catchUpRun;
    const projectId = this.projectId();
    const followed = this.#atBottom();
    let cursor: string | null = from;

    this.#resumeFrom = from;

    try {
      while (cursor) {
        const page: MessagePage = await this.#chat.list(projectId, {
          despues: cursor,
          limite: CATCH_UP_BLOCK,
        });

        if (run !== this.#catchUpRun) {
          return;
        }

        this.#addMessages(page.messages, false);
        cursor = page.nextCursor;
        this.#resumeFrom = cursor;
      }

      this.historyError.set(null);

      // La cifra quedó vieja: lo perdido el socket nunca lo contó.
      if (followed && isVisible()) {
        await this.#markLatest();
      } else {
        const { unreadCount } = await this.#chat.readState(projectId);

        this.#realtime.setUnread(projectId, unreadCount);
      }
    } catch (error) {
      if (run === this.#catchUpRun) {
        this.#showHistoryError(error);
      }
    }
  }

  /**
   * La marca se fija con el id, y el servidor toma la fecha de ese mensaje. Con dos
   * pestañas la atrasada no la hace retroceder: el backend solo la deja avanzar. Un
   * fallo no se muestra: el mensaje sigue contando como no leído, que es lo cierto.
   *
   * Una pestaña oculta no marca, aunque esté al fondo: nadie lo está viendo, y una
   * cifra que se pone en cero sola enseña a no creerle al contador.
   */
  async #markLatest(): Promise<void> {
    const projectId = this.projectId();
    const last = this.messages().at(-1);

    if (!last || last.id === this.#lastMarkedId || !isVisible()) {
      return;
    }

    const run = ++this.#markRun;

    this.#lastMarkedId = last.id;

    try {
      const { unreadCount } = await this.#chat.markRead(projectId, last.id);

      if (run === this.#markRun) {
        this.#realtime.setUnread(projectId, unreadCount);
      }
    } catch {
      this.#lastMarkedId = null;
    }
  }

  #showHistoryError(error: unknown): void {
    const outcome = apiErrorOutcome(error);

    this.historyError.set(outcome.kind === 'none' ? null : outcome.message);
  }

  /**
   * Inserta y, si la persona estaba abajo, la sigue y lo da por leído; si leía
   * historial, no la mueve y no lo ha leído. La distancia se mide aquí, antes de que
   * el contenido nuevo cambie la altura, y no con un evento `scroll`, que en una
   * pestaña en segundo plano no llega.
   */
  #addMessages(messages: readonly ChatMessage[], mark = true): void {
    const atBottom = this.#atBottom();

    this.messages.update((current) => mergeMessages(current, messages));

    if (atBottom) {
      this.#scrollToBottom();

      if (mark) {
        void this.#markLatest();
      }
    }
  }

  #atBottom(): boolean {
    const element = this.scroller()?.nativeElement;

    return (
      !element ||
      element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_TOLERANCE_PX
    );
  }

  #scrollToBottom(): void {
    afterNextRender(
      () => {
        const element = this.scroller()?.nativeElement;

        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      },
      { injector: this.#injector },
    );
  }
}
