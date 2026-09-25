import type { AppServer, ServerToClientEvents } from './events.js';
import { projectRoom, userRoom } from './events.js';

/**
 * Único punto por el que los servicios tocan el tiempo real. No importan `io`
 * ni construyen salas: piden "avisa a este proyecto" o "suma a esta persona".
 *
 * Sin servidor registrado todo esto no hace nada. Pasa cuando `app.ts` se usa
 * sin `server.ts`, como en una prueba con Supertest; en ejecución normal
 * `server.ts` siempre lo registra antes de escuchar.
 */
let io: AppServer | null = null;

export const registerSocketServer = (server: AppServer): void => {
  io = server;
};

/**
 * Se llama siempre después de persistir: avisar de algo que quizá no se guardó
 * es peor que no avisar.
 */
export const emitToProject = <E extends keyof ServerToClientEvents>(
  projectId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void => {
  io?.to(projectRoom(projectId)).emit(event, ...args);
};

/**
 * Suma a la sala del proyecto todos los sockets abiertos de la persona, vía su
 * sala personal. Sin esto, quien entra a un proyecto no recibe nada de él hasta
 * reconectarse.
 */
export const joinProjectRoom = (userId: string, projectId: string): void => {
  io?.in(userRoom(userId)).socketsJoin(projectRoom(projectId));
};

/**
 * El inverso, y el que protege la regla de oro: quien sale de un proyecto deja
 * de recibir sus eventos en ese momento, no cuando se reconecte.
 */
export const leaveProjectRoom = (userId: string, projectId: string): void => {
  io?.in(userRoom(userId)).socketsLeave(projectRoom(projectId));
};
