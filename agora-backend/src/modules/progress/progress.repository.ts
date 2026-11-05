import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { lockSchedule } from '../phases/phases.repository.js';
import { userSummarySelect } from '../users/users.repository.js';

interface CreateProgressData {
  projectId: string;
  authorId: string;
  description: string;
  taskId?: string;
}

export interface UpdateProgressData {
  description?: string;
  taskId?: string | null;
}

// El autor sale con `userSummarySelect`, la misma persona pública de siempre.
const progressInclude = {
  author: { select: userSummarySelect },
} satisfies Prisma.ProgressInclude;

export type ProgressRow = Prisma.ProgressGetPayload<{ include: typeof progressInclude }>;

/**
 * La tarea se comprueba con el bloqueo puesto: hecho antes, una tarea borrada
 * entre medias haría fallar la clave foránea con un 500 en vez de un 404.
 */
const taskIsInProject = async (
  tx: Prisma.TransactionClient,
  projectId: string,
  taskId: string,
): Promise<boolean> => {
  const task = await tx.task.findFirst({
    where: { id: taskId, phase: { projectId } },
    select: { id: true },
  });

  return task !== null;
};

/** Historial del proyecto, lo más reciente primero. */
export const findProgress = (projectId: string): Promise<ProgressRow[]> =>
  prisma.progress.findMany({
    where: { projectId },
    include: progressInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

/** Filtra también por proyecto: un avance de otro proyecto aquí no existe. */
export const findProgressEntry = (
  projectId: string,
  progressId: string,
): Promise<ProgressRow | null> =>
  prisma.progress.findFirst({ where: { id: progressId, projectId }, include: progressInclude });

/** Devuelve `null` si la tarea no es de este proyecto. */
export const createProgress = (data: CreateProgressData): Promise<ProgressRow | null> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, data.projectId);

    if (data.taskId && !(await taskIsInProject(tx, data.projectId, data.taskId))) {
      return null;
    }

    return tx.progress.create({ data, include: progressInclude });
  });

/** Devuelve `null` si la tarea no es de este proyecto. */
export const updateProgress = (
  projectId: string,
  progressId: string,
  data: UpdateProgressData,
): Promise<ProgressRow | null> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, projectId);

    if (data.taskId && !(await taskIsInProject(tx, projectId, data.taskId))) {
      return null;
    }

    return tx.progress.update({ where: { id: progressId }, data, include: progressInclude });
  });

export const deleteProgress = async (progressId: string): Promise<void> => {
  await prisma.progress.delete({ where: { id: progressId } });
};
