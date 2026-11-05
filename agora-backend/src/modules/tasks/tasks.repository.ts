import { NotificationType } from '@prisma/client';
import type { Notification, Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { createNotification } from '../notifications/notifications.repository.js';
import { lockSchedule } from '../phases/phases.repository.js';
import { userSummarySelect } from '../users/users.repository.js';

interface CreateTaskData {
  phaseId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  startDate?: Date;
  dueDate?: Date;
  completedAt?: Date | null;
  createdById: string;
}

export interface UpdateTaskData {
  phaseId?: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  completedAt?: Date | null;
}

export type MissingReference = 'phase-not-found' | 'assignee-not-found';

export type AddDependencyResult = 'added' | 'not-found' | 'duplicate' | 'cycle';

// Una tarea no tiene columna de proyecto: su proyecto es el de su fase.
const inProject = (projectId: string): Prisma.TaskWhereInput => ({ phase: { projectId } });

// El responsable sale con `userSummarySelect`, la misma persona pública que en
// los miembros y en la lista de proyectos.
const taskInclude = {
  assignee: { select: userSummarySelect },
  dependencies: { select: { dependsOnTaskId: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

/** La tarea escrita y, si se la asignaron a alguien, su notificación. */
export interface WrittenTask {
  task: TaskRow;
  notification: Notification | null;
}

/**
 * Sigue las dependencias desde `dependsOnId`. Si por algún camino se llega a
 * `taskId`, agregar la arista cerraría un ciclo, sea directo o de varios saltos.
 */
const closesCycle = (
  edges: { taskId: string; dependsOnTaskId: string }[],
  taskId: string,
  dependsOnId: string,
): boolean => {
  const prerequisites = new Map<string, string[]>();

  for (const edge of edges) {
    prerequisites.set(edge.taskId, [
      ...(prerequisites.get(edge.taskId) ?? []),
      edge.dependsOnTaskId,
    ]);
  }

  const visited = new Set<string>();
  const pending = [dependsOnId];

  while (pending.length > 0) {
    const current = pending.pop() as string;

    if (current === taskId) {
      return true;
    }

    if (!visited.has(current)) {
      visited.add(current);
      pending.push(...(prerequisites.get(current) ?? []));
    }
  }

  return false;
};

/** Por la fase y, dentro de ella, por antigüedad: las tareas no tienen posición propia. */
export const findTasks = (projectId: string): Promise<TaskRow[]> =>
  prisma.task.findMany({
    where: inProject(projectId),
    include: taskInclude,
    orderBy: [{ phase: { position: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }],
  });

/** Filtra también por proyecto: una tarea de otro proyecto aquí no existe. */
export const findTask = (projectId: string, taskId: string): Promise<TaskRow | null> =>
  prisma.task.findFirst({ where: { id: taskId, ...inProject(projectId) }, include: taskInclude });

/**
 * Comprueba la fase y el responsable, y va siempre con el bloqueo puesto: hecho
 * antes, una tarea creada entre la comprobación de «la fase tiene tareas» y el
 * borrado de esa fase se iría con ella, y una asignada mientras se retira a esa
 * persona quedaría a nombre de quien ya no es miembro.
 *
 * Una cuenta desactivada no recibe tareas, igual que no puede dirigir un proyecto.
 */
const findMissingReference = async (
  tx: Prisma.TransactionClient,
  projectId: string,
  references: { phaseId?: string; assigneeId?: string | null },
): Promise<MissingReference | null> => {
  if (references.phaseId) {
    const phase = await tx.phase.findFirst({
      where: { id: references.phaseId, projectId },
      select: { id: true },
    });

    if (!phase) {
      return 'phase-not-found';
    }
  }

  if (references.assigneeId) {
    const member = await tx.projectMember.findFirst({
      where: { projectId, userId: references.assigneeId, user: { isActive: true } },
      select: { id: true },
    });

    if (!member) {
      return 'assignee-not-found';
    }
  }

  return null;
};

/**
 * Asignarse una tarea a uno mismo no avisa: nadie necesita saber lo que acaba de
 * hacer. Va en la transacción de la tarea, y solo si el responsable cambió.
 */
const notifyAssignment = async (
  tx: Prisma.TransactionClient,
  task: TaskRow,
  previousAssigneeId: string | null,
  actorId: string,
): Promise<Notification | null> => {
  if (!task.assigneeId || task.assigneeId === previousAssigneeId || task.assigneeId === actorId) {
    return null;
  }

  return createNotification(tx, {
    userId: task.assigneeId,
    type: NotificationType.TASK_ASSIGNED,
    title: 'Se te asignó una tarea',
    body: task.title,
    resourceId: task.id,
  });
};

/** Toma el mismo bloqueo que las fases: ver `findMissingReference`. */
export const createTask = (
  projectId: string,
  data: CreateTaskData,
): Promise<WrittenTask | MissingReference> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, projectId);

    const missing = await findMissingReference(tx, projectId, data);

    if (missing) {
      return missing;
    }

    const task = await tx.task.create({ data, include: taskInclude });

    return { task, notification: await notifyAssignment(tx, task, null, data.createdById) };
  });

/** Mover o asignar una tarea necesita el bloqueo por la misma razón que crearla. */
export const updateTask = (
  projectId: string,
  taskId: string,
  actorId: string,
  data: UpdateTaskData,
): Promise<WrittenTask | MissingReference> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, projectId);

    const missing = await findMissingReference(tx, projectId, data);

    if (missing) {
      return missing;
    }

    const { assigneeId } = await tx.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { assigneeId: true },
    });
    const task = await tx.task.update({ where: { id: taskId }, data, include: taskInclude });

    return { task, notification: await notifyAssignment(tx, task, assigneeId, actorId) };
  });

/** Con el bloqueo, para no cruzarse con una dependencia que se esté agregando. */
export const deleteTask = (projectId: string, taskId: string): Promise<void> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, projectId);
    await tx.task.delete({ where: { id: taskId } });
  });

/**
 * El grafo se recorre dentro de la transacción y con el bloqueo puesto. Fuera,
 * dos personas podrían agregar A→B y B→A a la vez: cada una vería el grafo sin
 * la otra arista, las dos pasarían la comprobación y el ciclo quedaría guardado.
 */
export const addDependency = (
  projectId: string,
  taskId: string,
  dependsOnId: string,
): Promise<AddDependencyResult> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, projectId);

    const found = await tx.task.count({
      where: { id: { in: [taskId, dependsOnId] }, ...inProject(projectId) },
    });

    if (found !== 2) {
      return 'not-found';
    }

    const edges = await tx.taskDependency.findMany({
      where: { task: inProject(projectId) },
      select: { taskId: true, dependsOnTaskId: true },
    });

    if (edges.some((edge) => edge.taskId === taskId && edge.dependsOnTaskId === dependsOnId)) {
      return 'duplicate';
    }

    if (closesCycle(edges, taskId, dependsOnId)) {
      return 'cycle';
    }

    await tx.taskDependency.create({ data: { taskId, dependsOnTaskId: dependsOnId } });

    return 'added';
  });

/** Devuelve si había algo que borrar. */
export const removeDependency = async (taskId: string, dependsOnId: string): Promise<boolean> => {
  const { count } = await prisma.taskDependency.deleteMany({
    where: { taskId, dependsOnTaskId: dependsOnId },
  });

  return count > 0;
};
