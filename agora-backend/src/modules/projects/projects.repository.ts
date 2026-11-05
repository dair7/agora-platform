import {
  ConversationType,
  NotificationType,
  Prisma,
  ProjectRole,
  SystemRole,
} from '@prisma/client';
import type { Notification, Project, ProjectMember, ProjectStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { createNotification } from '../notifications/notifications.repository.js';
import { lockSchedule } from '../phases/phases.repository.js';
import { userSummarySelect } from '../users/users.repository.js';

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
  description?: string | null;
  objectives?: string | null;
  status?: ProjectStatus;
  startDate?: Date | null;
  endDate?: Date | null;
  budget?: number | null;
}

export type TransferLeadResult = 'done' | 'not-lead' | 'not-member';

const notifyInvitation = (
  tx: Prisma.TransactionClient,
  userId: string,
  project: Pick<Project, 'id' | 'title'>,
): Promise<Notification> =>
  createNotification(tx, {
    userId,
    type: NotificationType.PROJECT_INVITATION,
    title: 'Te sumaron a un proyecto',
    body: project.title,
    resourceId: project.id,
  });

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

// La persona sale con `userSummarySelect`, la misma forma que en la lista de
// proyectos y en la consulta de usuarios.
const memberSelect = {
  id: true,
  role: true,
  joinedAt: true,
  user: { select: userSummarySelect },
} satisfies Prisma.ProjectMemberSelect;

/**
 * Lo que la lista añade a cada proyecto, en la misma consulta: el investigador
 * principal, con un `include` acotado a su rol, y el número de miembros. Pedir
 * el detalle de cada proyecto sería una consulta por fila.
 */
const listItemInclude = {
  members: {
    where: { role: ProjectRole.PRINCIPAL_INVESTIGATOR },
    select: { user: { select: userSummarySelect } },
    take: 1,
  },
  _count: { select: { members: true } },
} satisfies Prisma.ProjectInclude;

export type ProjectListRow = Prisma.ProjectGetPayload<{ include: typeof listItemInclude }>;

export const findProjects = (
  scope: Prisma.ProjectWhereInput,
  filters: ListFilters,
  pagination: Pagination,
): Promise<[ProjectListRow[], number]> => {
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
      include: listItemInclude,
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
export const createProject = (
  data: CreateProjectData,
): Promise<{ project: Project; notification: Notification | null }> => {
  const { principalInvestigatorId, ...fields } = data;

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        ...fields,
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

    // Quien crea y quien dirige pueden ser personas distintas. Si son la misma, ya
    // lo sabe: las notificaciones son para hechos que otro provocó.
    const notification =
      principalInvestigatorId === data.createdById
        ? null
        : await notifyInvitation(tx, principalInvestigatorId, project);

    return { project, notification };
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

/**
 * Proyectos donde la persona es miembro: de aquí salen las salas a las que se
 * une su socket. El coordinador no tiene filas en project_members, así que no
 * entra a ninguna sala de proyecto, y es intencional: no participa del chat.
 */
export const findMemberProjectIds = async (userId: string): Promise<string[]> => {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });

  return memberships.map((membership) => membership.projectId);
};

/**
 * Alta de miembro y de participante del chat en la misma transacción: la
 * conversación del proyecto tiene que reflejar exactamente quién es miembro, o
 * el módulo de chat heredaría el trabajo de reconciliar las dos listas.
 */
export const addMember = (project: Project, userId: string): Promise<Notification> =>
  prisma.$transaction(async (tx) => {
    const projectId = project.id;

    await tx.projectMember.create({
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

    return notifyInvitation(tx, userId, project);
  });

/**
 * Membresía, participación en el chat y tareas asignadas, en la misma transacción.
 * Una tarea a nombre de quien ya no es miembro es algo que la pantalla mostraría
 * como cierto; desasignarla no destruye nada, y se reasigna. Solo las de este
 * proyecto. Devuelve cuántas tareas quedaron sin responsable.
 *
 * Toma el bloqueo del cronograma: sin él, una tarea asignada justo mientras se
 * retira a esa persona quedaría a su nombre.
 */
export const removeMember = (projectId: string, userId: string): Promise<number> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, projectId);

    await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
    await tx.conversationParticipant.deleteMany({ where: { conversation: { projectId }, userId } });

    const { count } = await tx.task.updateMany({
      where: { assigneeId: userId, phase: { projectId } },
      data: { assigneeId: null },
    });

    return count;
  });

/**
 * Los dos cambios de rol en una transacción: quien lea en cualquier momento ve un
 * solo investigador principal. El bloqueo serializa dos relevos a la vez, y el rol
 * de quien lo pide se comprueba con él puesto.
 */
export const transferLead = (
  projectId: string,
  currentLeadId: string,
  newLeadId: string,
): Promise<TransferLeadResult> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, projectId);

    const members = await tx.projectMember.findMany({
      where: { projectId, userId: { in: [currentLeadId, newLeadId] } },
      select: { userId: true, role: true, user: { select: { isActive: true } } },
    });
    const current = members.find((member) => member.userId === currentLeadId);
    const next = members.find((member) => member.userId === newLeadId);

    if (current?.role !== ProjectRole.PRINCIPAL_INVESTIGATOR) {
      return 'not-lead';
    }

    if (!next?.user.isActive) {
      return 'not-member';
    }

    await tx.projectMember.update({
      where: { projectId_userId: { projectId, userId: currentLeadId } },
      data: { role: ProjectRole.CO_INVESTIGATOR },
    });
    await tx.projectMember.update({
      where: { projectId_userId: { projectId, userId: newLeadId } },
      data: { role: ProjectRole.PRINCIPAL_INVESTIGATOR },
    });

    return 'done';
  });
