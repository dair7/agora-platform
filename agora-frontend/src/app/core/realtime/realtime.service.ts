import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import type { ChatMessage } from '../api/chat.types';
import type { AppNotification } from '../api/notifications.types';
import { expireSession } from '../session/expire-session';
import { SessionEndedError, SessionService } from '../session/session.service';
import type { ClientToServerEvents, RealtimeStatus, ServerToClientEvents } from './realtime.types';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Por proyecto, quién está en línea. Un proyecto que no está es uno del que no se sabe nada. */
type Presence = ReadonlyMap<string, ReadonlySet<string>>;

const NO_PRESENCE: Presence = new Map();

/** El mismo tope de espera que usa la reconexión automática de Socket.io. */
const RETRY_DELAY_MS = 5000;

/**
 * Socket.io cuelga del origen, sin el `/api/v1` de la API. Sin `apiUrl`, que solo pasa
 * con un `ng build` a secas, el de la propia página.
 */
const socketUrl = (): string =>
  environment.apiUrl ? new URL(environment.apiUrl).origin : window.location.origin;

/**
 * La conexión en tiempo real. Todo su estado vive en señales: en una aplicación sin
 * zone.js, lo que llega por el socket y no pasa por una señal no redibuja nada.
 *
 * Conecta y desconecta solo, siguiendo la sesión: no hay que acordarse de llamarlo
 * desde el inicio y el cierre de sesión. La coordinación también conecta: entra a
 * su sala personal, y no recibe presencia porque no tiene salas de proyecto.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  readonly #session = inject(SessionService);
  readonly #router = inject(Router);

  readonly #status = signal<RealtimeStatus>('disconnected');
  readonly #presence = signal<Presence>(NO_PRESENCE);
  readonly #unread = signal<ReadonlyMap<string, number>>(new Map());
  /** Por conversación privada, o `null` mientras el servidor no haya dicho nada. */
  readonly #conversationUnread = signal<ReadonlyMap<string, number> | null>(null);
  readonly #chatMessages = new Subject<ChatMessage>();
  readonly #connected = new Subject<void>();
  readonly #disconnected = new Subject<void>();
  readonly #scheduleChanged = new Subject<string>();
  readonly #tasksChanged = new Subject<string>();
  readonly #progressChanged = new Subject<string>();
  readonly #documentsChanged = new Subject<string>();
  readonly #notifications = new Subject<AppNotification>();

  #socket: AppSocket | null = null;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Ya se renovó para este intento: un segundo `TOKEN_EXPIRED` no renueva otra vez. */
  #renewedForHandshake = false;

  readonly status = this.#status.asReadonly();

  /**
   * Los mensajes que llegan por el socket. Un flujo y no una señal: una señal
   * fusiona dos cambios en el mismo ciclo, y se perdería un mensaje. La lista en sí
   * vive en una señal, en la pantalla del chat.
   */
  readonly chatMessages = this.#chatMessages.asObservable();

  /**
   * Cada conexión establecida, también la primera. Es síncrono a propósito: quien
   * escucha ve la lista tal como estaba antes de que llegue ningún mensaje nuevo.
   */
  readonly connected = this.#connected.asObservable();

  /**
   * Cada caída de la conexión. Síncrono como `connected`: lo que hay en la lista en
   * ese momento es hasta donde el historial es continuo.
   */
  readonly disconnected = this.#disconnected.asObservable();

  /** El id del proyecto cuyo cronograma cambió. Quien lo muestra vuelve a pedirlo. */
  readonly scheduleChanged = this.#scheduleChanged.asObservable();

  /** El id del proyecto cuyas tareas cambiaron. Quien las muestra vuelve a pedirlas. */
  readonly tasksChanged = this.#tasksChanged.asObservable();

  /** El id del proyecto cuyos avances cambiaron: uno nuevo, editado o borrado. */
  readonly progressChanged = this.#progressChanged.asObservable();

  /** El id del proyecto cuyos documentos cambiaron: uno subido o una versión borrada. */
  readonly documentsChanged = this.#documentsChanged.asObservable();

  /** Lo que llega a la sala personal. Un flujo, como `chatMessages`: dos no se fusionan. */
  readonly notifications = this.#notifications.asObservable();

  constructor() {
    effect(() => {
      const userId = this.#session.user()?.id;

      untracked(() => (userId ? this.#connect() : this.#disconnect()));
    });
  }

  /**
   * Quién está en línea en un proyecto, o `null` si no se sabe: sin conexión, o en un
   * proyecto sin sala para esta persona.
   */
  presenceIn(projectId: string): ReadonlySet<string> | null {
    return this.#presence().get(projectId) ?? null;
  }

  /** Los mensajes sin leer de un proyecto, según la última cifra del servidor. */
  unreadIn(projectId: string): number {
    return this.#unread().get(projectId) ?? 0;
  }

  /**
   * La cifra del servidor. Es la única fuente: la entregan `GET /proyectos` y la marca
   * de lectura, y aquí solo se guarda para que el socket pueda sumar sobre ella.
   */
  setUnread(projectId: string, count: number): void {
    this.#unread.set(new Map(this.#unread()).set(projectId, count));
  }

  /** Sin leer en todas las conversaciones privadas: la cifra de las barras. */
  readonly conversationUnreadTotal = computed(() =>
    [...(this.#conversationUnread()?.values() ?? [])].reduce((sum, count) => sum + count, 0),
  );

  /** Lo que dijo el servidor de todas: reemplaza lo que hubiera. */
  setConversationsUnread(conversations: readonly { id: string; unreadCount: number }[]): void {
    this.#conversationUnread.set(new Map(conversations.map((c) => [c.id, c.unreadCount])));
  }

  setConversationUnread(conversationId: string, count: number): void {
    this.#conversationUnread.set(
      new Map(this.#conversationUnread() ?? []).set(conversationId, count),
    );
  }

  /**
   * Un mensaje de proyecto suma sobre la cifra de ese proyecto, si se conoce. Uno privado
   * no tiene proyecto: suma sobre la de su conversación. Si es de una que el servidor aún no
   * contó, porque es nueva, sale de cero: lo que hace falta saber es que ya hubo respuesta.
   */
  #countUnread({ projectId, conversationId }: ChatMessage): void {
    if (projectId) {
      const known = this.#unread().get(projectId);

      if (known !== undefined) {
        this.setUnread(projectId, known + 1);
      }

      return;
    }

    const conversations = this.#conversationUnread();

    if (conversations) {
      this.setConversationUnread(conversationId, (conversations.get(conversationId) ?? 0) + 1);
    }
  }

  #connect(): void {
    if (this.#socket || !this.#session.accessToken) {
      return;
    }

    // `auth` como función: se evalúa en cada intento, así que un reintento siempre
    // lleva el token vigente, lo haya renovado el socket o el interceptor HTTP.
    const socket: AppSocket = io(socketUrl(), {
      auth: (send) => send({ token: this.#session.accessToken }),
    });

    this.#socket = socket;
    this.#status.set('connecting');

    socket.on('connect', () => {
      this.#renewedForHandshake = false;
      this.#status.set('connected');
      this.#connected.next();
    });

    socket.on('disconnect', (reason) => {
      // Sin conexión ya no se sabe quién está. Dejar los puntos verdes encendidos
      // sería mentir; al reconectar, `presencia:inicial` los vuelve a llenar. Los no
      // leídos no se tocan: esos siguen siendo ciertos aunque se caiga la conexión.
      this.#presence.set(NO_PRESENCE);
      this.#disconnected.next();

      if (reason === 'io client disconnect') {
        return;
      }

      this.#status.set('reconnecting');
      this.#retryIfAbandoned(socket);
    });

    socket.on('connect_error', (error) => void this.#onConnectError(socket, error));

    socket.on('chat:mensaje', (message) => {
      // El socket solo suma sobre lo que ya hay: nunca es la fuente de la cifra, porque
      // una pestaña recién abierta no sabe nada de lo anterior. El propio no cuenta: el
      // evento también llega a las otras pestañas de quien lo escribió. Lo que llega al
      // chat abierto también suma, y la marca de lectura lo baja si de verdad se leyó.
      if (message.sender.id !== this.#session.user()?.id) {
        this.#countUnread(message);
      }

      this.#chatMessages.next(message);
    });

    socket.on('cronograma:modificado', ({ projectId }) => this.#scheduleChanged.next(projectId));
    socket.on('tarea:actualizada', ({ projectId }) => this.#tasksChanged.next(projectId));
    socket.on('avance:creado', ({ projectId }) => this.#progressChanged.next(projectId));
    socket.on('avance:modificado', ({ projectId }) => this.#progressChanged.next(projectId));
    socket.on('documento:subido', ({ projectId }) => this.#documentsChanged.next(projectId));
    socket.on('documento:modificado', ({ projectId }) => this.#documentsChanged.next(projectId));
    socket.on('notificacion:nueva', (notification) => this.#notifications.next(notification));

    socket.on('presencia:inicial', (entries) => {
      this.#presence.set(new Map(entries.map((e) => [e.projectId, new Set(e.userIds)])));
    });

    socket.on('usuario:conectado', ({ userId, projectId }) => {
      this.#changePresence(projectId, (online) => online.add(userId));
    });

    socket.on('usuario:desconectado', ({ userId, projectId }) => {
      this.#changePresence(projectId, (online) => online.delete(userId));
    });
  }

  #disconnect(): void {
    clearTimeout(this.#retryTimer);
    this.#socket?.disconnect();
    this.#socket = null;
    this.#renewedForHandshake = false;
    this.#presence.set(NO_PRESENCE);
    // Aquí sí: esto es el fin de la sesión, y quien entre después es otra persona.
    this.#unread.set(new Map());
    this.#conversationUnread.set(null);
    this.#status.set('disconnected');
  }

  /** Los códigos son los de REST: el socket y el interceptor reaccionan al mismo contrato. */
  async #onConnectError(socket: AppSocket, error: Error): Promise<void> {
    const code = (error as Error & { data?: { code?: string } }).data?.code;

    switch (code) {
      case 'TOKEN_EXPIRED':
        await this.#renewAndReconnect(socket);
        break;
      case 'INVALID_TOKEN':
        expireSession(this.#session, this.#router);
        break;
      // Salió sin token, lo que solo pasa con la sesión ya terminada.
      case 'UNAUTHENTICATED':
        this.#disconnect();
        break;
      // Pasajero: el servidor caído o un `INTERNAL_ERROR`.
      default:
        this.#renewedForHandshake = false;
        this.#status.set('reconnecting');
        this.#retryIfAbandoned(socket);
    }
  }

  /**
   * Pide el token a `SessionService.renew()`, el mismo que usa el interceptor HTTP,
   * y nunca renueva por su cuenta. La renovación rota el refresh token: dos
   * renovaciones independientes competirían, y la segunda llegaría con uno ya
   * rotado. El backend lo tomaría por reutilización y cerraría TODAS las sesiones
   * de la persona. `renew()` comparte la renovación en curso, y en eso se apoya esto.
   */
  async #renewAndReconnect(socket: AppSocket): Promise<void> {
    // Un token recién emitido que vuelve vencido no se arregla renovando: sin este
    // tope, el socket y `/refrescar` entrarían en bucle.
    if (this.#renewedForHandshake) {
      expireSession(this.#session, this.#router);
      return;
    }

    try {
      await this.#session.renew();
    } catch (error) {
      // La sesión ya terminó en `SessionService`, pero eso no mueve a nadie de
      // pantalla: el interceptor navega por su lado, y aquí no hay petición HTTP.
      if (error instanceof SessionEndedError) {
        expireSession(this.#session, this.#router);
        return;
      }

      // Una caída de red: el refresh token sigue valiendo, se vuelve a intentar.
      this.#retryIfAbandoned(socket);
      return;
    }

    // La sesión pudo cerrarse mientras se renovaba.
    if (this.#socket === socket) {
      this.#renewedForHandshake = true;
      socket.connect();
    }
  }

  /**
   * La reconexión automática de Socket.io solo cubre las caídas de la conexión. Un
   * rechazo del handshake o una desconexión desde el servidor dejan el socket
   * inactivo (`active` en `false`) y nadie vuelve a intentarlo: hay que hacerlo aquí.
   */
  #retryIfAbandoned(socket: AppSocket): void {
    if (socket.active) {
      return;
    }

    clearTimeout(this.#retryTimer);
    this.#retryTimer = setTimeout(() => socket.connect(), RETRY_DELAY_MS);
  }

  /** Solo sobre proyectos conocidos: una entrada suelta contaría a medias. */
  #changePresence(projectId: string, change: (online: Set<string>) => void): void {
    const current = this.#presence().get(projectId);

    if (current) {
      const online = new Set(current);

      change(online);
      this.#presence.set(new Map(this.#presence()).set(projectId, online));
    }
  }
}
