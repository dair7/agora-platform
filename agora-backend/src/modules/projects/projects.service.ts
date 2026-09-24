import { ProjectRole, ProjectStatus, SystemRole } from '@prisma/client';
import type { Project } from '@prisma/client';
import { AppError } from '../../middlewares/error-handler.js';
import type { ProjectAccess } from '../../middlewares/project-access.js';
import * as repository from './projects.repository.js';
import type {
  AddMemberInput,
  CreateProjectInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from './projects.schema.js';

interface ScopedUser {
  id: string;
  systemRole: SystemRole;
}

export interface ProjectPage {
  items: Project[];
  total: number;
  page: number;
  perPage: number;
}

/**
 * El alcance no se decide aquí: `visibleProjectsFilter` es la única traducción
 * de la regla de oro y la comparten todos los módulos.
 */
export const listProjects = async (
  user: ScopedUser,
  query: ListProjectsQuery,
): Promise<ProjectPage> => {
  const [items, total] = await repository.findProjects(
    repository.visibleProjectsFilter(user),
    { status: query.status, search: query.search },
    { page: query.page, perPage: query.perPage },
  );

  return { items, total, page: query.page, perPage: query.perPage };
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
  const principalInvestigator = await repository.findUserById(input.principalInvestigatorId);

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

  return repository.createProject({
    ...data,
    createdById: creatorId,
    principalInvestigatorId,
  });
};

/**
 * La coherencia entre fechas se comprueba sobre los valores efectivos: el
 * cuerpo puede traer solo una de las dos, y compararla contra la que ya está
 * guardada es lo único que evita dejar el proyecto con un rango imposible.
 */
const assertDateRange = (project: Project, input: UpdateProjectInput): void => {
  const startDate = input.startDate ?? project.startDate;
  const endDate = input.endDate ?? project.endDate;

  if (startDate && endDate && startDate > endDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field: 'endDate', message: 'La fecha de fin no puede ser anterior a la de inicio' },
    ]);
  }
};

export const updateProject = async (
  access: ProjectAccess,
  input: UpdateProjectInput,
): Promise<Project> => {
  // Un proyecto cerrado no se reabre por esta vía: el cierre estampa closed_at
  // y volver atrás dejaría la marca sin sentido.
  if (access.project.status === ProjectStatus.COMPLETED) {
    throw new AppError(409, 'CONFLICT', 'El proyecto está cerrado y no admite cambios');
  }

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
  const user = await repository.findUserByEmail(input.email);

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

  await repository.addMember(access.project.id, user.id);

  return repository.findMembers(access.project.id);
};

export const removeMember = async (access: ProjectAccess, userId: string): Promise<void> => {
  const membership = await repository.findMember(access.project.id, userId);

  if (!membership) {
    throw new AppError(404, 'NOT_FOUND', 'La persona no es miembro del proyecto');
  }

  // Quitar al investigador principal dejaría el proyecto sin nadie que pueda
  // gestionarlo. Reasignarlo es competencia del coordinador y no existe todavía.
  if (membership.role === ProjectRole.PRINCIPAL_INVESTIGATOR) {
    throw new AppError(409, 'CONFLICT', 'No se puede quitar al investigador principal');
  }

  await repository.removeMember(access.project.id, userId);
};
