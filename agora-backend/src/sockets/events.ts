import type { NotificationType } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import type { AuthUser } from '../middlewares/authenticate.js';

/**
 * Contrato público del canal en tiempo real. Los nombres van en español, igual
 * que las rutas: es lo que consume el frontend.
 *
 * Esta interfaz es la lista cerrada de eventos, el equivalente de `ERROR_CODES`:
 * el servidor está tipado con ella, así que emitir un evento que no esté aquí,
 * o con un payload distinto, no compila.
 */
export interface ServerToClientEvents {
  'chat:mensaje': (payload: ChatMessagePayload) => void;
  'usuario:conectado': (payload: PresencePayload) => void;
  'usuario:desconectado': (payload: PresencePayload) => void;
  'presencia:inicial': (payload: InitialPresencePayload) => void;
  'cronograma:modificado': (payload: ScheduleChangedPayload) => void;
  'tarea:actualizada': (payload: TaskChangedPayload) => void;
  'avance:creado': (payload: ProgressCreatedPayload) => void;
  'avance:modificado': (payload: ProgressChangedPayload) => void;
  'documento:subido': (payload: DocumentUploadedPayload) => void;
  'documento:modificado': (payload: DocumentChangedPayload) => void;
  'notificacion:nueva': (payload: NotificationPayload) => void;
}

/**
 * Vacío a propósito. Toda modificación entra por REST y se persiste antes de
 * emitirse; el socket del cliente solo escucha.
 */
export type ClientToServerEvents = Record<string, never>;

export type InterServerEvents = Record<string, never>;

/** Lo que el handshake deja en `socket.data`, con la misma forma que `req.user`. */
export interface SocketData {
  user: AuthUser;
}

/**
 * Mismo objeto que devuelven las rutas de enviar: el frontend maneja un solo tipo de
 * mensaje venga de donde venga. `conversationId` va siempre, y `projectId` solo en el
 * chat de un proyecto: un mensaje privado no lo tiene.
 * Las fechas viajan como texto ISO, que es en lo que las convierte el JSON.
 */
export interface ChatMessagePayload {
  id: string;
  conversationId: string;
  projectId?: string;
  content: string;
  createdAt: string;
  sender: { id: string; fullName: string };
}

export interface PresencePayload {
  userId: string;
  projectId: string;
}

/**
 * Quién está en línea en un proyecto. `userIds` incluye a quien se acaba de
 * conectar, y va vacío si no hay nadie: el cliente tiene que poder distinguir
 * «nadie conectado» de «todavía no sé nada de ese proyecto».
 */
export interface ProjectPresence {
  projectId: string;
  userIds: string[];
}

/**
 * Una entrada por cada sala de proyecto de la persona. Es siempre la foto completa,
 * también al sumarla a un proyecto estando conectada: el cliente reemplaza lo que
 * tenía, y una foto de un solo proyecto borraría la presencia de los demás.
 */
export type InitialPresencePayload = ProjectPresence[];

/**
 * Solo el identificador, y el cliente vuelve a pedir el cronograma entero. Un
 * cronograma son unas pocas filas, y así crear, editar, borrar y reordenar emiten
 * exactamente lo mismo, en vez de cuatro formas distintas que el cliente tendría
 * que fusionar.
 */
export interface ScheduleChangedPayload {
  projectId: string;
}

/**
 * Solo el identificador, por la misma razón que `ScheduleChangedPayload`, y así
 * el cliente trata los dos eventos igual: crear, editar, borrar y las
 * dependencias emiten exactamente lo mismo, y el cliente vuelve a pedir las tareas.
 */
export interface TaskChangedPayload {
  projectId: string;
}

/** Solo el identificador, por la misma razón: el cliente trata los cuatro igual. */
export interface ProgressCreatedPayload {
  projectId: string;
}

/** También al subir una versión nueva: una lista que ya estaba abierta cambia igual. */
export interface DocumentUploadedPayload {
  projectId: string;
}

/**
 * Al editar o borrar un avance. Evento aparte y no `avance:creado`: un evento cuyo
 * nombre dice lo contrario de lo que pasó es peor que no tenerlo, porque quien lo
 * lea en el futuro confiará en el nombre.
 */
export interface ProgressChangedPayload {
  projectId: string;
}

/** Al borrar una versión, por la misma razón. Los documentos no se editan. */
export interface DocumentChangedPayload {
  projectId: string;
}

/**
 * Va a la sala personal, no a la del proyecto, y es la única que no se reduce a
 * `{ projectId }`: es un hecho dirigido a una persona. Mismo objeto que devuelve
 * `GET /notificaciones`, con las fechas como texto ISO.
 */
export interface NotificationPayload {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  resourceId: string | null;
  /** A qué proyecto lleva. `null` si ya no se puede llegar: la pantalla no enlaza. */
  projectId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// Los nombres de sala se construyen solo aquí. Escritos a mano en cada archivo,
// una errata deja a alguien fuera de la sala sin que falle nada.
export const projectRoom = (projectId: string): string => `proyecto:${projectId}`;

export const userRoom = (userId: string): string => `usuario:${userId}`;
