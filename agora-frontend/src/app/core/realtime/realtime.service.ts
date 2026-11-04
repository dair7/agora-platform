import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import type { ChatMessage } from '../api/chat.types';
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
 * Socket.io cuelga del origen, sin el `/api/v1` de la API. Sin `apiUrl`
 * (producción, hasta la fase 14), el de la propia página.
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
  readonly #chatMessages = new Subject<ChatMessage>();
  readonly #connected = new Subject<void>();

  #socket: AppSocket | null = null;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Ya se renovó para este intento: un segundo `TOKEN_EXPIRED` no renueva otra vez. */
  #renewedForHandshake = false;
  /** El chat que la persona tiene abierto ahora: lo que llega ahí ya está leído. */
  #openChatId: string | null = null;

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

  constructor() {
    effect(() => {
      const userId = this.#session.user()?.id;

      untracked(() => (userId ? this.#connect() : this.#disconnect()));
    });
  }

  /**
   * Quién está en línea en un proyecto, o `null` si no se sabe: sin conexión, en un
   * proyecto sin sala para esta persona, o en uno al que la sumaron ya conectada.
   */
  presenceIn(projectId: string): ReadonlySet<string> | null {
    return this.#presence().get(projectId) ?? null;
  }

  /**
   * Los mensajes sin leer de un proyecto. Viven en memoria y no sobreviven a una
   * recarga: `last_read_at` existe en la base, pero ningún endpoint lo expone. Es un
   * hueco de la fase 11.
   */
  unreadIn(projectId: string): number {
    return this.#unread().get(projectId) ?? 0;
  }

  /** La persona está mirando este chat: lo que había queda leído, y lo que llegue también. */
  openChat(projectId: string): void {
    this.#openChatId = projectId;
    this.#setUnread(projectId, 0);
  }

  closeChat(): void {
    this.#openChatId = null;
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

      if (reason === 'io client disconnect') {
        return;
      }

      this.#status.set('reconnecting');
      this.#retryIfAbandoned(socket);
    });

    socket.on('connect_error', (error) => void this.#onConnectError(socket, error));

    socket.on('chat:mensaje', (message) => {
      const mine = message.sender.id === this.#session.user()?.id;

      // El propio no cuenta: el evento también llega a las otras pestañas de quien lo
      // escribió.
      if (!mine && message.projectId !== this.#openChatId) {
        this.#setUnread(message.projectId, this.unreadIn(message.projectId) + 1);
      }

      this.#chatMessages.next(message);
    });

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

  #setUnread(projectId: string, count: number): void {
    this.#unread.set(new Map(this.#unread()).set(projectId, count));
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
