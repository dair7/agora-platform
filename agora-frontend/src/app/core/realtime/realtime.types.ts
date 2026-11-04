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

export interface ServerToClientEvents {
  'presencia:inicial': (payload: ProjectPresence[]) => void;
  'usuario:conectado': (payload: PresenceChange) => void;
  'usuario:desconectado': (payload: PresenceChange) => void;
}

/** Vacío a propósito: toda modificación entra por REST, y el socket solo escucha. */
export type ClientToServerEvents = Record<string, never>;

export type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
