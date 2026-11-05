import { ProjectRole, ProjectStatus, SystemRole } from '@prisma/client';
import type { Project } from '@prisma/client';
import { AppError } from '../../middlewares/error-handler.js';
import type { ProjectAccess } from '../../middlewares/project-access.js';
import { emitToProject, joinProjectRoom, leaveProjectRoom } from '../../sockets/emitter.js';
import { countUnreadByProject } from '../chat/chat.repository.js';
import { announce } from '../notifications/notifications.service.js';
import { findUserByEmail, findUserById } from '../users/users.repository.js';
import type { UserSummary } from '../users/users.repository.js';
import * as repository from './projects.repository.js';
import type { ProjectListRow } from './projects.repository.js';
import type {
  AddMemberInput,
  CreateProjectInput,
  ListProjectsQuery,
  TransferLeadInput,
  UpdateProjectInput,
} from './projects.schema.js';

interface ScopedUser {
  id: string;
  systemRole: SystemRole;
}

/**
 * Un elemento de la lista: el proyecto más su investigador principal y su número
 * de miembros. Es otro tipo que el `Project` de las escrituras y del detalle.
 *
 * `principalInvestigator` admite `null` aunque la API lo garantice —crear un
 * proyecto lo exige y quitarlo responde 409—: el esquema no. Borrar a una
 * persona en la base arrastra sus membresías en cascada, y el proyecto quedaría
 * sin investigador principal sin que nada lo impida.
 */
export type ProjectListItem = Project & {
  principalInvestigator: UserSummary | null;
  memberCount: number;
  /** Mensajes ajenos sin leer. Cero para quien no participa, como la coordinación. */
  unreadCount: number;
};

export interface ProjectPage {
  items: ProjectListItem[];
  total: number;
  page: number;
  perPage: number;
}

// `_count` es un detalle de Prisma: sale traducido, no tal cual.
const toListItem = (
  { members, _count, ...project }: ProjectListRow,
  unreadCount: number,
): ProjectListItem => ({
  ...project,
  principalInvestigator: members[0]?.user ?? null,
  memberCount: _count.members,
  unreadCount,
});

/**
 * El alcance no se decide aquí: `visibleProjectsFilter` es la única traducción
 * de la regla de oro y la comparten todos los módulos.
 */
export const listProjects = async (
  user: ScopedUser,
  query: ListProjectsQuery,
): Promise<ProjectPage> => {
  const [rows, total] = await repository.findProjects(
    repository.visibleProjectsFilter(user),
    { status: query.status, search: query.search },
    { page: query.page, perPage: query.perPage },
  );

  // Una consulta para toda la página, no una por tarjeta.
  const unread = await countUnreadByProject(
    user.id,
    rows.map((row) => row.id),
  );

  return {
    items: rows.map((row) => toListItem(row, unread.get(row.id) ?? 0)),
    total,
    page: query.page,
    perPage: query.perPage,
  };
};

/** El acceso ya lo resolvió el middleware; aquí solo se cargan las relaciones. */
export const getProject = async (projectId: string) => {
  const project = await repository.findProjectDetail(projectId);

  if (!project) {
    throw new AppError(404, 'NOT_FOUND', 'El proyecto no existe o no tienes acceso a él');
  }

  return project;
};

export const createProject = async (
  creatorId: string,
  input: CreateProjectInput,
): Promise<Project> => {
  const principalInvestigator = await findUserById(input.principalInvestigatorId);

  if (!principalInvestigator || !principalInvestigator.isActive) {
    throw new AppError(404, 'NOT_FOUND', 'El investigador principal indicado no existe');
  }

  if (principalInvestigator.systemRole === SystemRole.COORDINATOR) {
    throw new AppError(
      409,
      'CONFLICT',
      'El coordinador de investigación no puede ser miembro de un proyecto',
    );
  }

  const { principalInvestigatorId, ...data } = input;

  const { project, notification } = await repository.createProject({
    ...data,
    createdById: creatorId,
    principalInvestigatorId,
  });

  // El investigador principal puede estar conectado mientras la coordinadora
  // crea el proyecto: entra a la sala ya, no en su próxima conexión.
  await joinProjectRoom(principalInvestigatorId, project.id);

  if (notification) {
    await announce(notification);
  }

  return project;
};

/**
 * La coherencia entre fechas se comprueba sobre los valores efectivos: el
 * cuerpo puede traer solo una de las dos, y compararla contra la que ya está
 * guardada es lo único que evita dejar el proyecto con un rango imposible.
 */
const assertDateRange = (project: Project, input: UpdateProjectInput): void => {
  // `undefined` y no `??`: `null` vacía la fecha, no es «la que ya estaba».
  const startDate = input.startDate === undefined ? project.startDate : input.startDate;
  const endDate = input.endDate === undefined ? project.endDate : input.endDate;

  if (startDate && endDate && startDate > endDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field: 'endDate', message: 'La fecha de fin no puede ser anterior a la de inicio' },
    ]);
  }
};

/**
 * Un proyecto cerrado es un expediente: no se reabre por esta vía, porque el cierre
 * estampa closed_at y volver atrás dejaría la marca sin sentido, y sus miembros
 * tampoco cambian.
 */
const assertProjectOpen = (project: Project): void => {
  if (project.status === ProjectStatus.COMPLETED) {
    throw new AppError(409, 'CONFLICT', 'El proyecto está cerrado y no admite cambios');
  }
};

export const updateProject = async (
  access: ProjectAccess,
  input: UpdateProjectInput,
): Promise<Project> => {
  assertProjectOpen(access.project);
  assertDateRange(access.project, input);

  return repository.updateProject(access.project.id, input);
};

export const closeProject = async (access: ProjectAccess): Promise<Project> => {
  if (access.project.status === ProjectStatus.COMPLETED) {
    throw new AppError(409, 'CONFLICT', 'El proyecto ya está cerrado');
  }

  return repository.closeProject(access.project.id, ProjectStatus.COMPLETED);
};

export const listMembers = (projectId: string) => repository.findMembers(projectId);

export const addMember = async (access: ProjectAccess, input: AddMemberInput) => {
  assertProjectOpen(access.project);

  const user = await findUserByEmail(input.email);

  // Una cuenta desactivada se trata como inexistente: distinguirlas revelaría
  // qué correos están registrados, igual que en el inicio de sesión.
  if (!user || !user.isActive) {
    throw new AppError(404, 'NOT_FOUND', 'No existe una cuenta activa con ese correo');
  }

  if (user.systemRole === SystemRole.COORDINATOR) {
    throw new AppError(
      409,
      'CONFLICT',
      'El coordinador de investigación no puede ser miembro de un proyecto: ya ve todos los proyectos',
    );
  }

  const existing = await repository.findMember(access.project.id, user.id);

  if (existing) {
    throw new AppError(409, 'CONFLICT', 'La persona ya es miembro del proyecto');
  }

  const notification = await repository.addMember(access.project, user.id);

  await joinProjectRoom(user.id, access.project.id);
  await announce(notification);

  return repository.findMembers(access.project.id);
};

export const removeMember = async (access: ProjectAccess, userId: string): Promise<void> => {
  assertProjectOpen(access.project);

  const membership = await repository.findMember(access.project.id, userId);

  if (!membership) {
    throw new AppError(404, 'NOT_FOUND', 'La persona no es miembro del proyecto');
  }

  // Quitar al investigador principal dejaría el proyecto sin nadie que pueda
  // gestionarlo. Primero tiene que traspasarlo: ver `transferLead`.
  if (membership.role === ProjectRole.PRINCIPAL_INVESTIGATOR) {
    throw new AppError(409, 'CONFLICT', 'No se puede quitar al investigador principal');
  }

  // Sus tareas se desasignan, pero el retiro no se bloquea: que alguien salga de
  // un proyecto es normal, y aquí no se destruye ninguna fila. Esa es la diferencia
  // con el 409 de borrar una fase con tareas.
  const unassignedTasks = await repository.removeMember(access.project.id, userId);

  await leaveProjectRoom(userId, access.project.id);

  if (unassignedTasks > 0) {
    emitToProject(access.project.id, 'tarea:actualizada', { projectId: access.project.id });
  }
};

/**
 * El relevo completo, en una transacción: el actual pasa a coinvestigador y el
 * nuevo a principal. La puerta de la ruta ya exigió el rol, pero se vuelve a mirar
 * con el bloqueo puesto: dos relevos a la vez pasarían los dos esa puerta.
 */
export const transferLead = async (
  access: ProjectAccess,
  userId: string,
  input: TransferLeadInput,
) => {
  assertProjectOpen(access.project);

  if (input.userId === userId) {
    throw new AppError(409, 'CONFLICT', 'Esa persona ya es el investigador principal');
  }

  const result = await repository.transferLead(access.project.id, userId, input.userId);

  if (result === 'not-lead') {
    throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción');
  }

  if (result === 'not-member') {
    throw new AppError(404, 'NOT_FOUND', 'La persona no es miembro activo del proyecto');
  }

  return repository.findMembers(access.project.id);
};
