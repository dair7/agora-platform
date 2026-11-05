import type { AppServer, ServerToClientEvents, SocketData } from './events.js';
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

/** A todos los sockets de una persona. Se llama siempre después de persistir. */
export const emitToUser = <E extends keyof ServerToClientEvents>(
  userId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void => {
  io?.to(userRoom(userId)).emit(event, ...args);
};

/**
 * Suma a la sala del proyecto todos los sockets abiertos de la persona, vía su
 * sala personal, y hace lo que hace una conexión nueva: le manda la foto de
 * presencia y la anuncia a la sala. Sin esto, quien entra a un proyecto estando
 * conectada no recibe nada de él hasta reconectarse, no sabe quién está y nadie la
 * ve aparecer. Sin sockets vivos no hay nada que hacer.
 */
export const joinProjectRoom = async (userId: string, projectId: string): Promise<void> => {
  if (!io) {
    return;
  }

  const server = io;
  const personal = userRoom(userId);
  const sockets = await server.in(personal).fetchSockets();

  if (sockets.length === 0) {
    return;
  }

  server.in(personal).socketsJoin(projectRoom(projectId));

  // Todas sus salas y no solo la nueva: ver `InitialPresencePayload`.
  const prefix = projectRoom('');
  const projectIds = new Set([projectId]);

  for (const socket of sockets) {
    for (const room of socket.rooms) {
      if (room.startsWith(prefix)) {
        projectIds.add(room.slice(prefix.length));
      }
    }
  }

  const presence = await Promise.all(
    [...projectIds].map(async (id) => {
      const inRoom = await server.in(projectRoom(id)).fetchSockets();

      return {
        projectId: id,
        userIds: [...new Set(inRoom.map(({ data }: { data: SocketData }) => data.user.id))],
      };
    }),
  );

  server.to(personal).emit('presencia:inicial', presence);
  server
    .to(projectRoom(projectId))
    .except(personal)
    .emit('usuario:conectado', { userId, projectId });
};

/**
 * El inverso, y el que protege la regla de oro: quien sale de un proyecto deja
 * de recibir sus eventos en ese momento, no cuando se reconecte. La sala se entera
 * de que se fue, solo si estaba conectada.
 */
export const leaveProjectRoom = async (userId: string, projectId: string): Promise<void> => {
  if (!io) {
    return;
  }

  const personal = userRoom(userId);
  const sockets = await io.in(personal).fetchSockets();

  io.in(personal).socketsLeave(projectRoom(projectId));

  if (sockets.length > 0) {
    io.to(projectRoom(projectId)).emit('usuario:desconectado', { userId, projectId });
  }
};

/**
 * Cierra todos los sockets de la persona. El JWT solo se valida al conectar, así
 * que sin esto una cuenta desactivada seguiría recibiendo eventos mientras tenga
 * una pestaña abierta.
 */
export const disconnectUser = (userId: string): void => {
  io?.in(userRoom(userId)).disconnectSockets(true);
};
