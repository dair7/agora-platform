import type { ChatMessage } from '../api/chat.types';
import type { AppNotification } from '../api/notifications.types';

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
  /** A la sala personal, con el objeto entero: la misma forma que `GET /notificaciones`. */
  'notificacion:nueva': (payload: AppNotification) => void;
}

/** Vacío a propósito: toda modificación entra por REST, y el socket solo escucha. */
export type ClientToServerEvents = Record<string, never>;

export type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
