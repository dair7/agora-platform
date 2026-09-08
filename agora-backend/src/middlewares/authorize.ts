import type { RequestHandler } from 'express';
import type { SystemRole } from '@prisma/client';
import { AppError } from './error-handler.js';
import { getAuthUser } from './authenticate.js';

/**
 * Autorización por `users.system_role`. Va siempre después de `authenticate`.
 *
 * El rol dentro de un proyecto (`project_members.role`) no se resuelve aquí:
 * depende del proyecto que traiga la ruta y de una consulta a la base de datos.
 * Ese es otro middleware y llega con el módulo de proyectos.
 */
export const authorize =
  (...roles: SystemRole[]): RequestHandler =>
  (req, _res, next) => {
    const user = getAuthUser(req);

    if (!roles.includes(user.systemRole)) {
      throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción');
    }

    next();
  };
