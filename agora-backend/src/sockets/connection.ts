import { findMemberProjectIds } from '../modules/projects/projects.repository.js';
import { projectRoom, userRoom } from './events.js';
import type { AppSocket } from './events.js';

const PROJECT_ROOM_PREFIX = projectRoom('');

/**
 * Sockets abiertos por usuario. La presencia es por persona, no por pestaña:
 * `usuario:conectado` sale con el primer socket y `usuario:desconectado` con el
 * último. Si no, abrir dos pestañas anunciaría dos veces y cerrar una daría por
 * desconectado a quien sigue en la otra.
 *
 * Vive en memoria porque el servidor es un solo proceso. El contador se toca de
 * forma síncrona al conectar y al desconectar, así que dos conexiones
 * simultáneas del mismo usuario no pueden leer el mismo valor.
 */
const openSockets = new Map<string, number>();

const projectIdsOf = (socket: AppSocket): string[] =>
  [...socket.rooms]
    .filter((room) => room.startsWith(PROJECT_ROOM_PREFIX))
    .map((room) => room.slice(PROJECT_ROOM_PREFIX.length));

/**
 * Las salas las decide el servidor a partir de la base de datos, nunca el
 * cliente: no existe un evento para unirse. Así nadie entra a la sala de un
 * proyecto ajeno cambiando un identificador.
 */
export const handleConnection = async (socket: AppSocket): Promise<void> => {
  const { id: userId } = socket.data.user;

  const count = (openSockets.get(userId) ?? 0) + 1;
  openSockets.set(userId, count);
  const isFirstSocket = count === 1;

  // `disconnecting` y no `disconnect`: en este punto el socket todavía conserva
  // sus salas, y hacen falta para saber a quién avisar.
  socket.on('disconnecting', () => {
    const remaining = (openSockets.get(userId) ?? 1) - 1;

    if (remaining > 0) {
      openSockets.set(userId, remaining);
      return;
    }

    openSockets.delete(userId);

    for (const projectId of projectIdsOf(socket)) {
      socket.to(projectRoom(projectId)).emit('usuario:desconectado', { userId, projectId });
    }
  });

  // La sala personal entra desde ya aunque el chat privado sea de la Entrega 4:
  // es por donde se alcanzan todos los sockets de una persona para sumarla o
  // sacarla de un proyecto sin que se reconecte.
  await socket.join(userRoom(userId));

  const projectIds = await findMemberProjectIds(userId);

  // La consulta es asíncrona y el cliente pudo irse mientras tanto.
  if (socket.disconnected) {
    return;
  }

  await socket.join(projectIds.map(projectRoom));

  if (isFirstSocket) {
    for (const projectId of projectIds) {
      socket.to(projectRoom(projectId)).emit('usuario:conectado', { userId, projectId });
    }
  }
};
