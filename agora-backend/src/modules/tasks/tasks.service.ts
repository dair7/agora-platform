import { ProjectRole, ProjectStatus, TaskStatus } from '@prisma/client';
import type { Project, Task } from '@prisma/client';
import { AppError } from '../../middlewares/error-handler.js';
import type { ProjectAccess } from '../../middlewares/project-access.js';
import { emitToProject } from '../../sockets/emitter.js';
import type { UserSummary } from '../users/users.repository.js';
import * as repository from './tasks.repository.js';
import type { MissingReference, TaskRow } from './tasks.repository.js';
import type { CreateTaskInput, UpdateTaskInput } from './tasks.schema.js';

/**
 * La tarea más su responsable y las tareas de las que depende. Una sola forma
 * para la lista y para las escrituras.
 */
export type TaskItem = Task & {
  assignee: UserSummary | null;
  dependsOnTaskIds: string[];
};

// `dependencies` es un detalle de Prisma: sale traducido, no tal cual.
const toTaskItem = ({ dependencies, ...task }: TaskRow): TaskItem => ({
  ...task,
  dependsOnTaskIds: dependencies.map((dependency) => dependency.dependsOnTaskId),
});

/** Mismo criterio que la edición del proyecto: cerrado es de solo lectura. */
const assertProjectOpen = (project: Project): void => {
  if (project.status === ProjectStatus.COMPLETED) {
    throw new AppError(409, 'CONFLICT', 'El proyecto está cerrado y no admite cambios');
  }
};

const taskNotFound = (): AppError =>
  new AppError(404, 'NOT_FOUND', 'La tarea no existe en este proyecto');

const getTask = async (projectId: string, taskId: string): Promise<TaskRow> => {
  const task = await repository.findTask(projectId, taskId);

  if (!task) {
    throw taskNotFound();
  }

  return task;
};

/** Traduce lo que el repositorio comprobó dentro de la transacción. */
const toWrittenTask = (result: TaskRow | MissingReference): TaskRow => {
  if (result === 'phase-not-found') {
    throw new AppError(404, 'NOT_FOUND', 'La fase no existe en este proyecto');
  }

  if (result === 'assignee-not-found') {
    throw new AppError(404, 'NOT_FOUND', 'La persona indicada no es miembro activo del proyecto');
  }

  return result;
};

/**
 * Un tablero donde solo el principal puede mover algo no sirve de nada: la gracia
 * es que cada quien mueva lo suyo. Pero asignar sigue siendo decisión del
 * principal, así que quien tiene la tarea cambia su estado y nada más, y nadie se
 * autoasigna. Sin responsable, solo el principal la edita.
 *
 * Mira las claves del cuerpo, no los valores: mandar otro campo responde 403
 * aunque traiga lo que ya había, en vez de un 200 que ignore lo demás.
 */
const assertCanEdit = (
  access: ProjectAccess,
  task: Task,
  userId: string,
  input: UpdateTaskInput,
): void => {
  if (access.membership?.role === ProjectRole.PRINCIPAL_INVESTIGATOR) {
    return;
  }

  if (!access.membership || task.assigneeId !== userId) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Solo el investigador principal o quien tiene asignada la tarea puede editarla',
    );
  }

  if (Object.keys(input).some((field) => field !== 'status')) {
    throw new AppError(403, 'FORBIDDEN', 'Quien tiene asignada la tarea solo cambia su estado');
  }
};

/**
 * Igual que en proyectos, sobre los valores efectivos: el cuerpo puede traer
 * solo una de las dos fechas, y la otra es la que ya está guardada.
 */
const assertDateRange = (task: Task, input: UpdateTaskInput): void => {
  const startDate = input.startDate ?? task.startDate;
  const dueDate = input.dueDate ?? task.dueDate;

  if (startDate && dueDate && startDate > dueDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field: 'dueDate', message: 'La fecha límite no puede ser anterior a la de inicio' },
    ]);
  }
};

/**
 * `completed_at` sigue al estado y lo escribe solo el servidor, venga el cambio
 * de quien venga. Una tarea que ya estaba terminada conserva su fecha.
 */
const completionFor = (
  status: TaskStatus | undefined,
  current: Task | null,
): { completedAt?: Date | null } => {
  if (status === undefined) {
    return {};
  }

  return { completedAt: status === TaskStatus.DONE ? (current?.completedAt ?? new Date()) : null };
};

// Después de persistir, nunca antes. Todas las escrituras avisan igual: ver
// `TaskChangedPayload` en events.ts.
const notifyTaskChanged = (projectId: string): void => {
  emitToProject(projectId, 'tarea:actualizada', { projectId });
};

export const listTasks = async (projectId: string): Promise<TaskItem[]> => {
  const rows = await repository.findTasks(projectId);

  return rows.map(toTaskItem);
};

export const createTask = async (
  access: ProjectAccess,
  userId: string,
  input: CreateTaskInput,
): Promise<TaskItem> => {
  assertProjectOpen(access.project);

  const row = toWrittenTask(
    await repository.createTask(access.project.id, {
      ...input,
      ...completionFor(input.status, null),
      createdById: userId,
    }),
  );

  notifyTaskChanged(access.project.id);

  return toTaskItem(row);
};

/**
 * El permiso va antes que el cierre, igual que en las rutas con
 * `requireProjectRole`. Aquí no puede ser un middleware: depende de la tarea y
 * del cuerpo.
 */
export const updateTask = async (
  access: ProjectAccess,
  userId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskItem> => {
  const current = await getTask(access.project.id, taskId);

  assertCanEdit(access, current, userId, input);
  assertProjectOpen(access.project);
  assertDateRange(current, input);

  const row = toWrittenTask(
    await repository.updateTask(access.project.id, taskId, {
      ...input,
      ...completionFor(input.status, current),
    }),
  );

  notifyTaskChanged(access.project.id);

  return toTaskItem(row);
};

export const deleteTask = async (access: ProjectAccess, taskId: string): Promise<void> => {
  assertProjectOpen(access.project);

  await getTask(access.project.id, taskId);
  await repository.deleteTask(access.project.id, taskId);

  notifyTaskChanged(access.project.id);
};

/**
 * Las dependencias informan, no gobiernan: una tarea se puede terminar aunque
 * las suyas no lo estén, y `updateTask` no las mira a propósito. `BLOCKED` es un
 * estado que se pone a mano.
 */
export const addDependency = async (
  access: ProjectAccess,
  taskId: string,
  dependsOnId: string,
): Promise<TaskItem> => {
  assertProjectOpen(access.project);

  if (taskId === dependsOnId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field: 'dependsOnTaskId', message: 'Una tarea no puede depender de sí misma' },
    ]);
  }

  const result = await repository.addDependency(access.project.id, taskId, dependsOnId);

  if (result === 'not-found') {
    throw taskNotFound();
  }

  if (result === 'duplicate') {
    throw new AppError(409, 'CONFLICT', 'Esa dependencia ya existe');
  }

  if (result === 'cycle') {
    throw new AppError(
      409,
      'CONFLICT',
      'Esa dependencia cerraría un ciclo: las tareas se esperarían entre sí y ninguna podría empezar',
    );
  }

  notifyTaskChanged(access.project.id);

  return toTaskItem(await getTask(access.project.id, taskId));
};

export const removeDependency = async (
  access: ProjectAccess,
  taskId: string,
  dependsOnId: string,
): Promise<void> => {
  assertProjectOpen(access.project);

  await getTask(access.project.id, taskId);

  if (!(await repository.removeDependency(taskId, dependsOnId))) {
    throw new AppError(404, 'NOT_FOUND', 'Esa dependencia no existe');
  }

  notifyTaskChanged(access.project.id);
};
