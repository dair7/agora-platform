import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type ApiErrorMessages, apiErrorCode, apiErrorOutcome } from '../../core/api/api-error';
import type {
  ChatMessage,
  ListMessagesQuery,
  MessagePage,
  ReadState,
} from '../../core/api/chat.types';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { SessionService } from '../../core/session/session.service';
import { Button } from '../../shared/ui/button/button';
import { Empty } from '../../shared/ui/empty/empty';
import { Notice } from '../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../shared/ui/skeleton/skeleton';
import { ChatComposer, isAtBottom } from './chat-composer';
import { ChatMessageRow } from './chat-message';
import { type PendingMessage, buildTimeline, mergeMessages } from './chat-timeline';

/** El máximo que acepta el backend: un hueco grande se recorre en menos peticiones. */
const CATCH_UP_BLOCK = 100;

const isVisible = (): boolean => document.visibilityState === 'visible';

/** Lo que distingue un chat de otro. El hilo no sabe si es de un proyecto o privado. */
export interface ChatSource {
  /** Identifica el chat: cuando cambia, el hilo vuelve a empezar. */
  key: string;
  list(query?: ListMessagesQuery): Promise<MessagePage>;
  send(content: string): Promise<ChatMessage>;
  readState(): Promise<ReadState>;
  markRead(messageId: string): Promise<ReadState>;
  /** Si un mensaje que llega por el socket es de este chat. */
  owns(message: ChatMessage): boolean;
  /** La cifra del servidor, para quien la pinta. */
  setUnread(count: number): void;
  /** El backend dice que esta persona no participa. */
  onForbidden?(): void;
  /** Lo que este chat tiene que decir de un error al enviar. */
  sendErrors?: ApiErrorMessages;
}

/**
 * El historial de un chat y su compositor: lo mismo en uno de proyecto y en uno privado.
 * Es un solo componente porque aquí está lo que costó medir: el cosido tras reconectar,
 * la marca de leído y los provisionales. Una segunda copia divergiría.
 */
@Component({
  selector: 'app-chat-thread',
  imports: [Button, ChatComposer, ChatMessageRow, Empty, LoadingStatus, Notice, Skeleton],
  templateUrl: './chat-thread.html',
  styleUrl: './chat-thread.css',
  host: { class: 'grid gap-espacio-4', '(document:visibilitychange)': 'onScroll()' },
})
export class ChatThread {
  readonly #injector = inject(Injector);
  readonly #session = inject(SessionService);
  readonly #realtime = inject(RealtimeService);

  readonly source = input.required<ChatSource>();
  /** Se lee y no se escribe: el compositor se ve deshabilitado, y `notice` dice por qué. */
  readonly readOnly = input(false);
  readonly notice = input<string | null>(null);
  /** Hasta saber si se puede escribir, el compositor no se pinta. */
  readonly showComposer = input(true);
  /** Quién está en línea, si el chat lo sabe. */
  readonly online = input<ReadonlySet<string> | null>(null);
  /** Sin pestañas encima, la lista tiene más sitio en una pantalla pequeña. */
  readonly tallList = input(false);

  // `private` de TypeScript: `viewChild` no admite los campos privados de ES.
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly composer = viewChild(ChatComposer);

  protected readonly scroller = computed(() => this.scrollerRef()?.nativeElement);

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

  protected readonly sending = computed(() =>
    this.pending().some((m) => m.localId === this.#composerId() && m.status === 'sending'),
  );

  readonly #canSend = computed(
    () => !this.readOnly() && !this.sending() && this.draft().trim() !== '',
  );

  constructor() {
    effect(() => {
      this.source();

      untracked(() => this.#open());
    });

    this.#realtime.chatMessages.pipe(takeUntilDestroyed()).subscribe((message) => {
      if (this.source().owns(message)) {
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
    if (isAtBottom(this.scroller())) {
      void this.#markLatest();
    }
  }

  /** Lo que estaba leyendo la persona se queda donde estaba: el bloque crece por arriba. */
  protected async loadOlder(): Promise<void> {
    const source = this.source();
    const oldest = this.messages()[0];

    if (!oldest || this.loadingOlder()) {
      return;
    }

    this.loadingOlder.set(true);

    try {
      const page = await source.list({ antes: oldest.id });

      // La ruta pudo cambiar a otro chat mientras tanto.
      if (this.messages()[0]?.id !== oldest.id) {
        return;
      }

      const element = this.scroller();
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

  protected onEdited(text: string): void {
    this.draft.set(text);
    this.#composerId.set(null);
  }

  protected async send(): Promise<void> {
    if (!this.#canSend()) {
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
    const source = this.source();

    try {
      const message = await source.send(content);

      this.pending.update((current) => current.filter((m) => m.localId !== localId));
      this.#addMessages([message]);

      if (this.#composerId() === localId) {
        this.#composerId.set(null);
        this.draft.set('');
        this.composer()?.focus();
      }
    } catch (error) {
      const outcome = apiErrorOutcome(error, source.sendErrors);

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
    const source = this.source();

    try {
      const [page, state] = await Promise.all([
        source.list(),
        source.readState().catch(() => null),
      ]);

      if (source.key !== this.source().key) {
        return;
      }

      if (state) {
        source.setUnread(state.unreadCount);
      }

      this.messages.update((current) => mergeMessages(current, page.messages));
      this.hasOlder.set(page.nextCursor !== null);
      this.historyError.set(null);
      this.#scrollToBottom();
      void this.#markLatest();
    } catch (error) {
      // El backend es quien sabe que la coordinación no participa.
      if (apiErrorCode(error) === 'FORBIDDEN' && source.onForbidden) {
        source.onForbidden();
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
    const source = this.source();
    const followed = isAtBottom(this.scroller());
    let cursor: string | null = from;

    this.#resumeFrom = from;

    try {
      while (cursor) {
        const page: MessagePage = await source.list({
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
        const { unreadCount } = await source.readState();

        source.setUnread(unreadCount);
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
    const source = this.source();
    const last = this.messages().at(-1);

    if (!last || last.id === this.#lastMarkedId || !isVisible()) {
      return;
    }

    const run = ++this.#markRun;

    this.#lastMarkedId = last.id;

    try {
      const { unreadCount } = await source.markRead(last.id);

      if (run === this.#markRun) {
        source.setUnread(unreadCount);
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
    const atBottom = isAtBottom(this.scroller());

    this.messages.update((current) => mergeMessages(current, messages));

    if (atBottom) {
      this.#scrollToBottom();

      if (mark) {
        void this.#markLatest();
      }
    }
  }

  #scrollToBottom(): void {
    afterNextRender(
      () => {
        const element = this.scroller();

        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      },
      { injector: this.#injector },
    );
  }
}
