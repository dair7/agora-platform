import type { Request, RequestHandler } from 'express';
import { SystemRole } from '@prisma/client';
import type { Project, ProjectMember, ProjectRole } from '@prisma/client';
import { AppError } from './error-handler.js';
import { getAuthUser } from './authenticate.js';
import { findProjectWithMembership } from '../modules/projects/projects.repository.js';
import type { ProjectIdParams } from '../modules/projects/projects.schema.js';

export interface ProjectAccess {
  project: Project;
  /** `null` para el coordinador: no tiene fila en project_members. */
  membership: ProjectMember | null;
  isCoordinator: boolean;
}

declare global {
  namespace Express {
    interface Request {
      projectAccess?: ProjectAccess;
    }
  }
}

/**
 * Para quien no es miembro el proyecto no existe, y por eso responde 404 y no
 * 403: un 403 confirmaría que ese identificador corresponde a un proyecto real,
 * que es justo lo que la regla de oro esconde. El 403 queda para quien sí es
 * miembro pero le falta el rol; ahí ya no hay nada que ocultar.
 */
const projectNotFound = (): AppError =>
  new AppError(404, 'NOT_FOUND', 'El proyecto no existe o no tienes acceso a él');

/**
 * Puerta de lectura. Resuelve el proyecto de `:projectId` y la membresía de
 * quien llama, y lo deja en `req.projectAccess`.
 *
 * Va siempre después de `authenticate` y después de validar el parámetro como
 * uuid: sin eso, un identificador malformado llega hasta Prisma.
 */
export const requireProjectMember: RequestHandler = async (req, _res, next) => {
  const user = getAuthUser(req);
  // `req.params` está tipado con una firma de índice que admite `string[]`, por
  // los comodines de Express 5. La ruta ya validó el parámetro como uuid; el
  // `Partial` mantiene la comprobación de abajo para la ruta que se olvide.
  const { projectId } = req.params as Partial<ProjectIdParams>;

  if (!projectId) {
    throw new AppError(500, 'INTERNAL_ERROR', 'La ruta no define el parámetro projectId');
  }

  const project = await findProjectWithMembership(projectId, user.id);

  if (!project) {
    throw projectNotFound();
  }

  const isCoordinator = user.systemRole === SystemRole.COORDINATOR;
  const membership = project.members[0] ?? null;

  if (!isCoordinator && !membership) {
    throw projectNotFound();
  }

  const { members: _members, ...bareProject } = project;

  req.projectAccess = { project: bareProject, membership, isCoordinator };

  next();
};

/**
 * Puerta de escritura. Lee lo que dejó `requireProjectMember` y exige un rol
 * dentro del proyecto.
 *
 * NO deja pasar al coordinador, y no es un olvido. El coordinador salta la
 * comprobación de visibilidad, no la de gestión: según el alcance declarado él
 * crea proyectos, asigna investigador principal y ve reportes, mientras que
 * fases, tareas, responsables y cierre son del investigador principal. Además
 * no tiene fila en project_members, así que no hay rol que evaluar.
 *
 * No añadir aquí un `|| isCoordinator`: le daría permisos de gestión sobre
 * todos los proyectos y el cambio no rompería ninguna ruta, así que pasaría
 * inadvertido. Lo que el coordinador sí puede hacer se controla con
 * `authorize(COORDINATOR)`, que es el otro eje.
 */
export const requireProjectRole =
  (...roles: ProjectRole[]): RequestHandler =>
  (req, _res, next) => {
    const { membership } = getProjectAccess(req);

    if (!membership || !roles.includes(membership.role)) {
      throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción');
    }

    next();
  };

/**
 * Acceso tipado a `req.projectAccess`, gemelo de `getAuthUser`. La propiedad es
 * opcional porque no todas las rutas pasan por `requireProjectMember`.
 */
export const getProjectAccess = (req: Request): ProjectAccess => {
  if (!req.projectAccess) {
    throw new AppError(500, 'INTERNAL_ERROR', 'La ruta no resolvió el acceso al proyecto');
  }

  return req.projectAccess;
};
