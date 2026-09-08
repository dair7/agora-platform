import type { Request, RequestHandler } from 'express';
import type { SystemRole } from '@prisma/client';
import { AppError } from './error-handler.js';
import { verifyAccessToken } from '../modules/auth/auth.tokens.js';

export interface AuthUser {
  id: string;
  email: string;
  systemRole: SystemRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const BEARER = 'Bearer ';

/**
 * Lee el access token de la cabecera `Authorization` y deja el usuario en
 * `req.user`. Todo sale del payload firmado; no hay consulta a la base.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith(BEARER)) {
    throw new AppError(
      401,
      'UNAUTHENTICATED',
      'Falta la cabecera Authorization con un token Bearer',
    );
  }

  const token = header.slice(BEARER.length).trim();

  if (!token) {
    throw new AppError(401, 'UNAUTHENTICATED', 'La cabecera Authorization no trae token');
  }

  const payload = verifyAccessToken(token);

  req.user = {
    id: payload.sub,
    email: payload.email,
    systemRole: payload.systemRole,
  };

  next();
};

/**
 * Acceso tipado a `req.user`. La propiedad es opcional porque las rutas
 * públicas no pasan por `authenticate`; este helper convierte esa duda en un
 * error explícito en lugar de repartir aserciones por los controladores.
 */
export const getAuthUser = (req: Request): AuthUser => {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'La ruta requiere autenticación');
  }

  return req.user;
};
