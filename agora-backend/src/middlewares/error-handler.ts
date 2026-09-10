import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Lista cerrada de códigos de error. Es contrato público: el cliente decide qué
 * hacer a partir de este valor y no del mensaje, que es texto para la persona.
 * `TOKEN_EXPIRED` dispara el refresco silencioso; `INVALID_TOKEN` cierra sesión.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
  'ACCOUNT_DISABLED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Error de dominio: lo lanza el código de negocio y llega tal cual al cliente. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface NormalizedError {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const normalize = (error: unknown): NormalizedError => {
  if (error instanceof AppError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: violación de índice único. P2025: el registro buscado no existe.
    if (error.code === 'P2002') {
      return { status: 409, code: 'CONFLICT', message: 'El recurso ya existe' };
    }
    if (error.code === 'P2025') {
      return { status: 404, code: 'NOT_FOUND', message: 'El recurso no existe' };
    }
    // P2023: dato inconsistente con la columna, en la práctica un uuid
    // malformado. Es culpa de quien llama, no del servidor, así que no puede
    // salir como 500. Las rutas validan sus parámetros y esto no debería
    // dispararse; es la red de seguridad para la que se olvide.
    if (error.code === 'P2023') {
      return {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no son válidos',
      };
    }
  }

  // Cualquier otra cosa es un fallo nuestro: mensaje genérico, sin detalles.
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Error interno del servidor' };
};

/** Se monta después de todas las rutas: lo que llegue aquí no existe. */
export const notFoundHandler: RequestHandler = (req) => {
  throw new AppError(404, 'NOT_FOUND', `Ruta no encontrada: ${req.method} ${req.originalUrl}`);
};

/**
 * Último middleware de la aplicación. Express 5 encamina hasta aquí también los
 * rechazos de promesas, así que los controladores asíncronos no necesitan
 * envoltorio.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const normalized = normalize(error);

  // Un 5xx es un fallo del servidor: se registra siempre, con la traza completa.
  if (normalized.status >= 500) {
    console.error(error);
  }

  res.status(normalized.status).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details !== undefined && { details: normalized.details }),
    },
  });
};
