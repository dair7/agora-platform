// Tipos del contrato de /api/v1/proyectos, tal como los responde el backend
// (`modules/projects`). Lo que el backend devuelve como null se escribe `| null`,
// no como campo opcional: el campo siempre llega.
//
// Fechas: todas son `string`, no `Date`. Llegan como texto ISO, que es en lo que
// las convierte el JSON, y el cliente las entrega tal cual. Las columnas de solo
// fecha (`startDate`, `endDate`) llegan a medianoche UTC: `2026-03-01T00:00:00.000Z`.

import type { SystemRole } from '../session/session.types';
import type { UserSummary } from './users.types';

// `SystemRole` ya vive en los tipos de la sesión; se reexporta para no tener dos
// definiciones del mismo enum.
export type { SystemRole };

/** `projects.status`. */
export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

/**
 * Los estados que acepta `PATCH /proyectos/:projectId`. Sin `COMPLETED`: cerrar
 * estampa `closedAt` y tiene su propio endpoint, `POST /:projectId/cerrar`.
 */
export type UpdatableProjectStatus = Exclude<ProjectStatus, 'COMPLETED'>;

/** `project_members.role`: el rol dentro de un proyecto. */
export type ProjectRole = 'PRINCIPAL_INVESTIGATOR' | 'CO_INVESTIGATOR';

/** `phases.status`. */
export type PhaseStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

/** El modelo `Project` tal cual: así lo devuelven la lista y las escrituras. */
export interface Project {
  id: string;
  title: string;
  description: string | null;
  objectives: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  /** Es un `Decimal` de Prisma, que el JSON serializa como cadena: `"15000000"`. */
  budget: string | null;
  createdById: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Una membresía con su persona (`memberSelect`). Nunca trae el hash de la contraseña. */
export interface Member {
  id: string;
  role: ProjectRole;
  joinedAt: string;
  user: UserSummary;
}

export interface Phase {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  position: number;
  status: PhaseStatus;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Un elemento de `GET /proyectos`. No es el mismo tipo que el `Project` de `POST`,
 * `PATCH` y el detalle: la lista suma el investigador principal y el número de
 * miembros, resueltos en la misma consulta, y las escrituras no los traen.
 */
export interface ProjectListItem extends Project {
  /**
   * `null` aunque la API lo garantice: el esquema no. Borrar a una persona en la
   * base arrastra sus membresías en cascada y el proyecto se queda sin él.
   */
  principalInvestigator: UserSummary | null;
  memberCount: number;
  /** Mensajes ajenos sin leer, calculado en el servidor. */
  unreadCount: number;
}

/** Respuesta de `GET /proyectos`. Sin sobre: llega así, no dentro de `{ project }`. */
export interface ProjectPage {
  items: ProjectListItem[];
  total: number;
  page: number;
  perPage: number;
}

/** `GET /proyectos/:projectId`: el proyecto con sus miembros y sus fases. */
export interface ProjectDetail extends Project {
  /** Por orden de entrada al proyecto. */
  members: Member[];
  /** Por `position`. */
  phases: Phase[];
}

/**
 * Parámetros de `GET /proyectos`, con los nombres en español del contrato. Los
 * que no se envían toman el valor del backend: página 1, 20 por página.
 */
export interface ListProjectsQuery {
  estado?: ProjectStatus;
  /** Hasta 200 caracteres. `ProjectsApi` la recorta y, si queda vacía, no la envía. */
  buscar?: string;
  pagina?: number;
  /** De 1 a 100. */
  porPagina?: number;
}

/**
 * Cuerpo de `POST /proyectos`. Las fechas van como `YYYY-MM-DD` y el presupuesto
 * como número, aunque la respuesta lo devuelva como cadena.
 */
export interface CreateProjectInput {
  title: string;
  principalInvestigatorId: string;
  description?: string;
  objectives?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
}

/** Cuerpo de `PATCH /proyectos/:projectId`. Al menos un campo. */
/** `null` vacía el campo, y ausente no lo cambia. `title` no admite `null`. */
export interface UpdateProjectInput {
  title?: string;
  description?: string | null;
  objectives?: string | null;
  status?: UpdatableProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
}

/** Cuerpo de `POST /proyectos/:projectId/miembros`. Se invita por correo. */
export interface AddMemberInput {
  email: string;
}
