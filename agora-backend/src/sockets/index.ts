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
import { handleConnection } from './connection.js';
import { registerSocketServer } from './emitter.js';
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

  registerSocketServer(io);

  io.use(handshake);

  io.on('connection', (socket) => {
    handleConnection(socket).catch((error: unknown) => {
      // Un socket sin sus salas no recibiría nada y el cliente no se enteraría.
      // Mejor cortarlo: socket.io-client reintenta solo.
      console.error(error);
      socket.disconnect(true);
    });
  });

  return io;
};
