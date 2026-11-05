import type { ChatMessage } from '../api/chat.types';

// Copia de lo que este cliente escucha del contrato de `sockets/events.ts`. Crece
// con él: los eventos se declaran primero en el backend.

/** Quién está en línea en un proyecto, contando a quien recibe el evento. */
export interface ProjectPresence {
  projectId: string;
  userIds: string[];
}

export interface PresenceChange {
  userId: string;
  projectId: string;
}

/** Los eventos de dominio de un proyecto solo dicen cuál: el cliente vuelve a pedir la lista. */
export interface ProjectEvent {
  projectId: string;
}

/** La sala personal lleva el objeto entero, con la misma forma que `GET /notificaciones`. */
export interface NotificationEvent {
  id: string;
  type: string;
  title: string;
  body: string | null;
  resourceId: string | null;
  /** A qué proyecto lleva. `null` si ya no se puede llegar: no se ofrece el enlace. */
  projectId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface ServerToClientEvents {
  'chat:mensaje': (payload: ChatMessage) => void;
  'presencia:inicial': (payload: ProjectPresence[]) => void;
  'usuario:conectado': (payload: PresenceChange) => void;
  'usuario:desconectado': (payload: PresenceChange) => void;
  'cronograma:modificado': (payload: ProjectEvent) => void;
  'tarea:actualizada': (payload: ProjectEvent) => void;
  'avance:creado': (payload: ProjectEvent) => void;
  'avance:modificado': (payload: ProjectEvent) => void;
  'documento:subido': (payload: ProjectEvent) => void;
  'documento:modificado': (payload: ProjectEvent) => void;
  'notificacion:nueva': (payload: NotificationEvent) => void;
}

/** Vacío a propósito: toda modificación entra por REST, y el socket solo escucha. */
export type ClientToServerEvents = Record<string, never>;

export type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
