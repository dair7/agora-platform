import { ConversationType, Prisma, ProjectRole, SystemRole } from '@prisma/client';
import type { Project, ProjectMember, ProjectStatus, User } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

/** Lo mínimo que hace falta para decidir el alcance. Encaja con `AuthUser`. */
interface ScopedUser {
  id: string;
  systemRole: SystemRole;
}

interface ListFilters {
  status?: ProjectStatus;
  search?: string;
}

interface Pagination {
  page: number;
  perPage: number;
}

interface CreateProjectData {
  title: string;
  description?: string;
  objectives?: string;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  createdById: string;
  principalInvestigatorId: string;
}

export interface UpdateProjectData {
  title?: string;
  description?: string;
  objectives?: string;
  status?: ProjectStatus;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
}

export type ProjectWithMembership = Project & { members: ProjectMember[] };

/**
 * Traducción única de la regla de oro: un usuario solo ve los proyectos donde
 * es miembro, y el coordinador es la excepción.
 *
 * Vive aquí y se exporta porque tareas, avances y documentos van a hacer la
 * misma pregunta. Si cada módulo la reescribe, la regla acaba teniendo cinco
 * implementaciones que se desincronizan.
 *
 * El `some` se traduce a un EXISTS sobre project_members, que está indexado
 * por user_id y por el par (project_id, user_id).
 */
export const visibleProjectsFilter = (user: ScopedUser): Prisma.ProjectWhereInput =>
  user.systemRole === SystemRole.COORDINATOR ? {} : { members: { some: { userId: user.id } } };

// Selección explícita del autor: nunca `include: { user: true }`, que arrastra
// `password_hash` hasta la respuesta.
const memberSelect = {
  id: true,
  role: true,
  joinedAt: true,
  user: { select: { id: true, email: true, fullName: true, systemRole: true, isActive: true } },
} satisfies Prisma.ProjectMemberSelect;

export const findProjects = (
  scope: Prisma.ProjectWhereInput,
  filters: ListFilters,
  pagination: Pagination,
): Promise<[Project[], number]> => {
  const where: Prisma.ProjectWhereInput = {
    AND: [
      scope,
      filters.status ? { status: filters.status } : {},
      filters.search ? { title: { contains: filters.search, mode: 'insensitive' } } : {},
    ],
  };

  // Las dos consultas van juntas para que el total corresponda a la misma foto
  // que la página devuelta.
  return prisma.$transaction([
    prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pagination.page - 1) * pagination.perPage,
      take: pagination.perPage,
    }),
    prisma.project.count({ where }),
  ]);
};

/**
 * Una sola consulta resuelve el acceso de todos los casos: el `include`
 * filtrado por usuario trae cero o una membresía, y el coordinador se decide
 * con el proyecto que ya viene cargado.
 */
export const findProjectWithMembership = (
  projectId: string,
  userId: string,
): Promise<ProjectWithMembership | null> =>
  prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { where: { userId } } },
  });

/** Detalle completo. Se pide aparte porque el middleware de acceso no carga
 * relaciones: hacerlo penalizaría a todas las escrituras, que no las usan. */
export const findProjectDetail = (projectId: string) =>
  prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: { select: memberSelect, orderBy: { joinedAt: 'asc' } },
      phases: { orderBy: { position: 'asc' } },
    },
  });

/**
 * Proyecto, investigador principal y conversación en una sola transacción.
 *
 * La conversación se crea aquí y no cuando llegue el módulo de chat: es 1:1 con
 * el proyecto y se borra en cascada con él, así que crearla después obligaría a
 * cada endpoint de chat a contemplar el caso "todavía no existe".
 */
export const createProject = (data: CreateProjectData): Promise<Project> => {
  const { principalInvestigatorId, ...project } = data;

  return prisma.project.create({
    data: {
      ...project,
      members: {
        create: { userId: principalInvestigatorId, role: ProjectRole.PRINCIPAL_INVESTIGATOR },
      },
      conversation: {
        create: {
          type: ConversationType.PROJECT,
          participants: { create: { userId: principalInvestigatorId } },
        },
      },
    },
  });
};

export const updateProject = (projectId: string, data: UpdateProjectData): Promise<Project> =>
  prisma.project.update({ where: { id: projectId }, data });

export const closeProject = (projectId: string, status: ProjectStatus): Promise<Project> =>
  prisma.project.update({
    where: { id: projectId },
    data: { status, closedAt: new Date() },
  });

export const findMembers = (projectId: string) =>
  prisma.projectMember.findMany({
    where: { projectId },
    select: memberSelect,
    orderBy: { joinedAt: 'asc' },
  });

export const findMember = (projectId: string, userId: string): Promise<ProjectMember | null> =>
  prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });

// Pertenece al módulo de usuarios, que todavía no existe. Cuando llegue, esta
// función se va con él y aquí queda la importación.
export const findUserByEmail = (email: string): Promise<User | null> =>
  prisma.user.findUnique({ where: { email } });

export const findUserById = (id: string): Promise<User | null> =>
  prisma.user.findUnique({ where: { id } });

/**
 * Alta de miembro y de participante del chat en la misma transacción: la
 * conversación del proyecto tiene que reflejar exactamente quién es miembro, o
 * el módulo de chat heredaría el trabajo de reconciliar las dos listas.
 */
export const addMember = (projectId: string, userId: string): Promise<ProjectMember> =>
  prisma.$transaction(async (tx) => {
    const member = await tx.projectMember.create({
      data: { projectId, userId, role: ProjectRole.CO_INVESTIGATOR },
    });

    // La conversación se busca en vez de darla por hecha: los proyectos que ya
    // existían antes de este módulo —los del seed— pueden no tener una, y una
    // invitación no debe fallar por eso.
    const conversation = await tx.conversation.findUnique({
      where: { projectId },
      select: { id: true },
    });

    if (conversation) {
      await tx.conversationParticipant.createMany({
        data: { conversationId: conversation.id, userId },
        skipDuplicates: true,
      });
    }

    return member;
  });

export const removeMember = async (projectId: string, userId: string): Promise<void> => {
  await prisma.$transaction([
    prisma.projectMember.delete({ where: { projectId_userId: { projectId, userId } } }),
    prisma.conversationParticipant.deleteMany({ where: { conversation: { projectId }, userId } }),
  ]);
};
