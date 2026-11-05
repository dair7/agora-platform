import { ProjectStatus } from '@prisma/client';
import type { Phase, Project } from '@prisma/client';
import { AppError } from '../../middlewares/error-handler.js';
import type { ProjectAccess } from '../../middlewares/project-access.js';
import { emitToProject } from '../../sockets/emitter.js';
import * as repository from './phases.repository.js';
import type { CreatePhaseInput, ReorderPhasesInput, UpdatePhaseInput } from './phases.schema.js';

/** Mismo criterio que la edición del proyecto: cerrado es de solo lectura. */
const assertProjectOpen = (project: Project): void => {
  if (project.status === ProjectStatus.COMPLETED) {
    throw new AppError(409, 'CONFLICT', 'El proyecto está cerrado y no admite cambios');
  }
};

const getPhase = async (projectId: string, phaseId: string): Promise<Phase> => {
  const phase = await repository.findPhase(projectId, phaseId);

  if (!phase) {
    throw new AppError(404, 'NOT_FOUND', 'La fase no existe en este proyecto');
  }

  return phase;
};

/**
 * Igual que en proyectos, sobre los valores efectivos: el cuerpo puede traer
 * solo una de las dos fechas, y la otra es la que ya está guardada.
 */
const assertDateRange = (phase: Phase, input: UpdatePhaseInput): void => {
  const startDate = input.startDate ?? phase.startDate;
  const endDate = input.endDate ?? phase.endDate;

  if (startDate && endDate && startDate > endDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field: 'endDate', message: 'La fecha de fin no puede ser anterior a la de inicio' },
    ]);
  }
};

// Después de persistir, nunca antes. Las cuatro escrituras avisan igual: ver
// `ScheduleChangedPayload` en events.ts.
const notifyScheduleChanged = (projectId: string): void => {
  emitToProject(projectId, 'cronograma:modificado', { projectId });
};

export const listPhases = (projectId: string): Promise<Phase[]> => repository.findPhases(projectId);

export const createPhase = async (
  access: ProjectAccess,
  input: CreatePhaseInput,
): Promise<Phase> => {
  assertProjectOpen(access.project);

  const phase = await repository.createPhase(access.project.id, input);

  notifyScheduleChanged(access.project.id);

  return phase;
};

export const updatePhase = async (
  access: ProjectAccess,
  phaseId: string,
  input: UpdatePhaseInput,
): Promise<Phase> => {
  assertProjectOpen(access.project);

  const current = await getPhase(access.project.id, phaseId);

  assertDateRange(current, input);

  const phase = await repository.updatePhase(phaseId, input);

  notifyScheduleChanged(access.project.id);

  return phase;
};

/**
 * La cascada del esquema existe para que borrar un proyecto no deje huérfanos, no
 * para que borrar una fase se lleve sus tareas y deje avances y documentos sin su
 * vínculo. Mismo criterio que retirar al investigador principal: 409 en vez de
 * romper algo en silencio.
 */
export const deletePhase = async (access: ProjectAccess, phaseId: string): Promise<void> => {
  assertProjectOpen(access.project);

  await getPhase(access.project.id, phaseId);

  const deleted = await repository.deletePhase(access.project.id, phaseId);

  if (!deleted) {
    throw new AppError(
      409,
      'CONFLICT',
      'La fase tiene tareas: muévelas a otra fase o bórralas antes de eliminarla',
    );
  }

  notifyScheduleChanged(access.project.id);
};

export const reorderPhases = async (
  access: ProjectAccess,
  input: ReorderPhasesInput,
): Promise<Phase[]> => {
  assertProjectOpen(access.project);

  const phases = await repository.reorderPhases(access.project.id, input.phaseIds);

  if (!phases) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      {
        field: 'phaseIds',
        message: 'La lista debe contener exactamente las fases del proyecto, sin repetir ninguna',
      },
    ]);
  }

  notifyScheduleChanged(access.project.id);

  return phases;
};
