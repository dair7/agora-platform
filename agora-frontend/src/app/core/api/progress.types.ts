// Tipos del contrato de /api/v1/proyectos/:projectId/avances (`modules/progress`).

import type { UserSummary } from './users.types';

/** `taskId` es `null` en un avance sin tarea, que es un estado legítimo. */
export interface ProgressEntry {
  id: string;
  projectId: string;
  taskId: string | null;
  authorId: string;
  author: UserSummary;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProgressInput {
  description: string;
  taskId?: string;
}

/** `taskId: null` suelta el avance de su tarea, y ausente no lo cambia. */
export interface UpdateProgressInput {
  description?: string;
  taskId?: string | null;
}
