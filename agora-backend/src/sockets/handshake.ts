import type { ExtendedError } from 'socket.io';
import { AppError } from '../middlewares/error-handler.js';
import type { ErrorCode } from '../middlewares/error-handler.js';
import { verifyAccessToken } from '../modules/auth/auth.tokens.js';
import type { AppSocket } from './events.js';

/**
 * El cliente recibe esto en `connect_error`: `message` para la persona y
 * `data.code` para decidir. Son los mismos códigos que en REST, así que
 * `TOKEN_EXPIRED` dispara el refresco y `INVALID_TOKEN` cierra sesión igual que
 * en el interceptor HTTP.
 */
const connectionError = (code: ErrorCode, message: string): ExtendedError => {
  const error: ExtendedError = new Error(message);
  error.data = { code };
  return error;
};

/**
 * Valida el JWT una sola vez, al conectar; después el socket queda asociado al
 * usuario. El token llega solo en `auth.token` y no hay respaldo por cabecera:
 * es el único camino que usa socket.io-client.
 *
 * Como `authenticate`, no consulta la base de datos. Que el socket sobreviva al
 * vencimiento del token es aceptable porque solo recibe: todo envío pasa por
 * REST, donde el token se revisa en cada petición.
 */
export const handshake = (socket: AppSocket, next: (err?: ExtendedError) => void): void => {
  const token: unknown = socket.handshake.auth.token;

  if (typeof token !== 'string' || !token) {
    next(connectionError('UNAUTHENTICATED', 'Falta el token de acceso en auth.token'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);

    socket.data.user = {
      id: payload.sub,
      email: payload.email,
      systemRole: payload.systemRole,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(connectionError(error.code, error.message));
      return;
    }

    // Igual que en el manejador de errores de Express: lo inesperado es un
    // fallo nuestro, se registra completo y sale genérico.
    console.error(error);
    next(connectionError('INTERNAL_ERROR', 'Error interno del servidor'));
  }
};
