import { ProjectRole, ProjectStatus } from '@prisma/client';
import type { Project } from '@prisma/client';
import { AppError } from '../../middlewares/error-handler.js';
import type { ProjectAccess } from '../../middlewares/project-access.js';
import { emitToProject } from '../../sockets/emitter.js';
import * as repository from './progress.repository.js';
import type { ProgressRow } from './progress.repository.js';
import type { CreateProgressInput, UpdateProgressInput } from './progress.schema.js';

/** Mismo criterio que la edición del proyecto: cerrado es de solo lectura. */
const assertProjectOpen = (project: Project): void => {
  if (project.status === ProjectStatus.COMPLETED) {
    throw new AppError(409, 'CONFLICT', 'El proyecto está cerrado y no admite cambios');
  }
};

const taskNotFound = (): AppError =>
  new AppError(404, 'NOT_FOUND', 'La tarea no existe en este proyecto');

const getEntry = async (projectId: string, progressId: string): Promise<ProgressRow> => {
  const entry = await repository.findProgressEntry(projectId, progressId);

  if (!entry) {
    throw new AppError(404, 'NOT_FOUND', 'El avance no existe en este proyecto');
  }

  return entry;
};

// Después de persistir. Sirve para editar y para borrar: ver `ProgressChangedPayload`.
const notifyChanged = (projectId: string): void => {
  emitToProject(projectId, 'avance:modificado', { projectId });
};

export const listProgress = (projectId: string): Promise<ProgressRow[]> =>
  repository.findProgress(projectId);

export const createProgress = async (
  access: ProjectAccess,
  userId: string,
  input: CreateProgressInput,
): Promise<ProgressRow> => {
  assertProjectOpen(access.project);

  const entry = await repository.createProgress({
    ...input,
    projectId: access.project.id,
    authorId: userId,
  });

  if (!entry) {
    throw taskNotFound();
  }

  // Después de persistir. Payload `{ projectId }`, como los demás: ver events.ts.
  emitToProject(access.project.id, 'avance:creado', { projectId: access.project.id });

  return entry;
};

/**
 * Solo quien lo escribió. Un avance es lo que una persona dice, y que otra lo
 * altere es peor que dejarlo como está: nadie reescribe las palabras de otro, ni
 * siquiera el investigador principal.
 */
export const updateProgress = async (
  access: ProjectAccess,
  userId: string,
  progressId: string,
  input: UpdateProgressInput,
): Promise<ProgressRow> => {
  const current = await getEntry(access.project.id, progressId);

  if (current.authorId !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'Solo quien escribió el avance puede editarlo');
  }

  assertProjectOpen(access.project);

  const entry = await repository.updateProgress(access.project.id, progressId, input);

  if (!entry) {
    throw taskNotFound();
  }

  notifyChanged(access.project.id);

  return entry;
};

/**
 * Borrar sí puede también el investigador principal, que responde del registro
 * del proyecto. Quitar un avance no pone palabras en boca de nadie.
 */
export const deleteProgress = async (
  access: ProjectAccess,
  userId: string,
  progressId: string,
): Promise<void> => {
  const current = await getEntry(access.project.id, progressId);
  const isPrincipal = access.membership?.role === ProjectRole.PRINCIPAL_INVESTIGATOR;

  if (current.authorId !== userId && !isPrincipal) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Solo quien escribió el avance o el investigador principal puede borrarlo',
    );
  }

  assertProjectOpen(access.project);

  await repository.deleteProgress(progressId);

  notifyChanged(access.project.id);
};
