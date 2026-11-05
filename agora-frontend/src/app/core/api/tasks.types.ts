// Tipos del contrato de /api/v1/proyectos/:projectId/tareas (`modules/tasks`).

import type { UserSummary } from './users.types';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'BLOCKED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Una tarea, con la misma forma en la lista y en las escrituras. No trae proyecto: el
 * suyo es el de su fase. Las fechas son texto: `startDate` y `dueDate` llegan a
 * medianoche UTC, y `completedAt` es un instante que escribe solo el servidor.
 */
export interface Task {
  id: string;
  phaseId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assignee: UserSummary | null;
  createdById: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  dependsOnTaskIds: string[];
  /** Avances que perderían su vínculo si la tarea se borra. */
  progressCount: number;
  /** Lo mismo con los documentos, contando cada versión. */
  documentCount: number;
}

export interface CreateTaskInput {
  phaseId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  /** `YYYY-MM-DD`. */
  startDate?: string;
  dueDate?: string;
}

/**
 * `null` vacía el campo, y ausente no lo cambia. `title` y `phaseId` no lo admiten.
 * Quien tiene la tarea asignada solo puede mandar `status`: con cualquier otro campo,
 * el backend responde 403.
 */
export interface UpdateTaskInput {
  phaseId?: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
}
