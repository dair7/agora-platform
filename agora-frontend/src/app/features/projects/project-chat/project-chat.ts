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
import type { ChatMessage } from '../../../core/api/chat.types';
import { ProjectsApi } from '../../../core/api/projects.api';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { SessionService } from '../../../core/session/session.service';
import { Button } from '../../../shared/ui/button/button';
import { Empty } from '../../../shared/ui/empty/empty';
import { Field, FieldTextarea } from '../../../shared/ui/field/field';
import { Notice } from '../../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { ChatMessageRow } from './chat-message';
import { type PendingMessage, buildTimeline, mergeMessages } from './chat-timeline';

/** Hasta esta distancia del fondo se considera que la persona está abajo. */
const BOTTOM_TOLERANCE_PX = 32;

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
    RouterLink,
    Skeleton,
  ],
  templateUrl: './project-chat.html',
  styleUrl: './project-chat.css',
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
      const projectId = this.projectId();

      untracked(() => this.#open(projectId));
    });

    this.#realtime.chatMessages.pipe(takeUntilDestroyed()).subscribe((message) => {
      if (message.projectId === this.projectId()) {
        this.#addMessages([message]);
      }
    });

    // Durante la desconexión pudieron llegar mensajes que el socket nunca entregó.
    this.#realtime.connected.pipe(takeUntilDestroyed()).subscribe(() => void this.#syncLatest());

    inject(DestroyRef).onDestroy(() => this.#realtime.closeChat());
  }

  protected isOnline(userId: string): boolean {
    return this.online()?.has(userId) ?? false;
  }

  protected reload(): void {
    void this.#syncLatest();
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

      // Una reconexión pudo descartar el historial mientras tanto: este bloque ya no
      // sería contiguo con lo que hay.
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

  #open(projectId: string): void {
    this.#realtime.openChat(projectId);
    this.messages.set([]);
    this.pending.set([]);
    this.draft.set('');
    this.#composerId.set(null);
    this.hasOlder.set(false);
    this.historyError.set(null);
    this.loading.set(true);

    void this.#syncLatest();
  }

  /**
   * Pide el bloque más reciente y lo une a lo que hay. Sirve para abrir y para
   * reconectar.
   *
   * Si el bloque no comparte ningún identificador con lo que ya estaba, entre los dos
   * se perdieron más mensajes de los que caben en un bloque, y no hay forma de saber
   * cuáles. Pegar las dos puntas mostraría una conversación continua que no es cierta,
   * así que lo anterior se descarta y queda el bloque nuevo, que sí es contiguo;
   * «Cargar anteriores» recupera el resto.
   *
   * La comparación es contra lo que había al EMPEZAR. Un mensaje que llega por el
   * socket mientras esta petición viaja también viene en el bloque, y contra la lista
   * del final parecería continuidad justo cuando hay un agujero. Por lo mismo, al
   * descartar se conserva lo llegado durante la petición: es más nuevo que el bloque.
   */
  async #syncLatest(): Promise<void> {
    const projectId = this.projectId();
    const known = new Set(this.messages().map((message) => message.id));

    try {
      const page = await this.#chat.list(projectId);

      if (projectId !== this.projectId()) {
        return;
      }

      const contiguous = page.messages.some((message) => known.has(message.id));

      if (contiguous) {
        this.#addMessages(page.messages);
      } else {
        this.messages.update((current) =>
          mergeMessages(
            current.filter((message) => !known.has(message.id)),
            page.messages,
          ),
        );
        this.hasOlder.set(page.nextCursor !== null);
        this.#scrollToBottom();
      }

      this.historyError.set(null);
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

  #showHistoryError(error: unknown): void {
    const outcome = apiErrorOutcome(error);

    this.historyError.set(outcome.kind === 'none' ? null : outcome.message);
  }

  /**
   * Inserta y, si la persona estaba abajo, la sigue; si leía historial, no la mueve.
   * La distancia se mide aquí, antes de que el contenido nuevo cambie la altura, y no
   * con un evento `scroll`, que en una pestaña en segundo plano no llega.
   */
  #addMessages(messages: readonly ChatMessage[]): void {
    const element = this.scroller()?.nativeElement;
    const distance = element ? element.scrollHeight - element.scrollTop - element.clientHeight : 0;

    this.messages.update((current) => mergeMessages(current, messages));

    if (distance <= BOTTOM_TOLERANCE_PX) {
      this.#scrollToBottom();
    }
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
