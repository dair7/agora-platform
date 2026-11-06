import { ProjectStatus } from '@prisma/client';
import type { AuthUser } from '../../middlewares/authenticate.js';
import { AppError } from '../../middlewares/error-handler.js';
import * as repository from './reports.repository.js';
import type { ListMyTasksQuery, ListProjectFiguresQuery } from './reports.schema.js';
import { todayInColombia } from './reports.today.js';

export interface TaskFigures {
  total: number;
  completed: number;
  /** `null` sin tareas: un proyecto vacío no tiene cifra, y un 0% diría que no avanza. */
  completedPercent: number | null;
  overdue: number;
}

const toFigures = ({ total, completed, overdue }: repository.TaskCounts): TaskFigures => ({
  total,
  completed,
  completedPercent: total === 0 ? null : Math.round((completed / total) * 100),
  overdue,
});

const toProjectFigures = ({ id, title, status, ...counts }: repository.ProjectFiguresRow) => ({
  id,
  title,
  status,
  tasks: toFigures(counts),
});

export const getSummary = async (user: AuthUser) => {
  const today = todayInColombia();
  const [byStatusRows, counts] = await Promise.all([
    repository.countProjectsByStatus(user),
    repository.countTasks(user, today),
  ]);

  // Los cinco estados siempre: un estado sin proyectos es un cero, no una clave que falta.
  const byStatus = Object.fromEntries(
    Object.values(ProjectStatus).map((status) => [
      status,
      byStatusRows.find((row) => row.status === status)?.count ?? 0,
    ]),
  ) as Record<ProjectStatus, number>;

  return {
    projects: { total: Object.values(byStatus).reduce((sum, count) => sum + count, 0), byStatus },
    tasks: toFigures(counts),
  };
};

export const listProjectFigures = async (user: AuthUser, query: ListProjectFiguresQuery) => {
  const [rows, total] = await repository.findProjectFigures(user, todayInColombia(), query);

  return { items: rows.map(toProjectFigures), total, page: query.page, perPage: query.perPage };
};

export const getProjectFigures = async (projectId: string): Promise<TaskFigures> => {
  const row = await repository.findOneProjectFigures(projectId, todayInColombia());

  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'El proyecto no existe');
  }

  return toProjectFigures(row).tasks;
};

export const listMyTasks = async (user: AuthUser, { limit }: ListMyTasksQuery) => {
  const today = todayInColombia();
  const [rows, total, overdueCount] = await repository.findMyTasks(user, today, limit);

  return {
    tasks: rows.map(({ phase: { project, ...phase }, dueDate, ...task }) => ({
      ...task,
      dueDate,
      // Comparar el texto basta: los dos son `YYYY-MM-DD`.
      overdue: dueDate !== null && dueDate.toISOString().slice(0, 10) < today,
      phase,
      project,
    })),
    total,
    overdueCount,
  };
};
