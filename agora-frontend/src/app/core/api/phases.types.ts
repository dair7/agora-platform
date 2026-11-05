// Tipos del contrato de /api/v1/proyectos/:projectId/fases (`modules/phases`). `Phase`
// y `PhaseStatus` viven en `projects.types.ts`, porque el detalle del proyecto las trae.

import type { PhaseStatus } from './projects.types';

export type { Phase, PhaseStatus } from './projects.types';

/** `position` no va: la pone el servidor, y el backend responde 400 si llega. */
export interface CreatePhaseInput {
  name: string;
  description?: string;
  status?: PhaseStatus;
  /** `YYYY-MM-DD`. */
  startDate?: string;
  endDate?: string;
}

/** `null` vacía el campo, y ausente no lo cambia. `name` no admite `null`. */
export interface UpdatePhaseInput {
  name?: string;
  description?: string | null;
  status?: PhaseStatus;
  startDate?: string | null;
  endDate?: string | null;
}
