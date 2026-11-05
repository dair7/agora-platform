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
 * Mismo objeto que devuelve `POST /proyectos/:projectId/mensajes`, más el
 * proyecto: el frontend maneja un solo tipo de mensaje venga de donde venga.
 * Las fechas viajan como texto ISO, que es en lo que las convierte el JSON.
 */
export interface ChatMessagePayload {
  id: string;
  projectId: string;
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

/** Una entrada por cada sala de proyecto a la que el socket acaba de entrar. */
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
