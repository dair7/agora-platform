import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import type {
  AppServer,
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from './events.js';
import { handshake } from './handshake.js';

/**
 * Monta Socket.io sobre el mismo servidor HTTP que Express.
 *
 * El CORS se declara aquí y no hereda el de Express: son dos configuraciones
 * distintas. Comparten la variable de entorno para que no se desincronicen.
 */
export const initSocketServer = (httpServer: HttpServer): AppServer => {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    { cors: { origin: env.CORS_ORIGIN } },
  );

  io.use(handshake);

  return io;
};
