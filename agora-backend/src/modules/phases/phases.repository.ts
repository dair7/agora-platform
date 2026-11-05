import type { Phase, PhaseStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

interface CreatePhaseData {
  name: string;
  description?: string;
  status?: PhaseStatus;
  startDate?: Date;
  endDate?: Date;
}

export interface UpdatePhaseData {
  name?: string;
  description?: string | null;
  status?: PhaseStatus;
  startDate?: Date | null;
  endDate?: Date | null;
}

/**
 * Serializa las escrituras del cronograma dentro de un mismo proyecto: la segunda
 * espera a que termine la primera y ve lo que dejó. Sin esto, dos altas a la vez
 * calcularían la misma posición, y un reordenamiento podría validar una lista que
 * otra escritura acaba de dejar vieja. Las tareas toman el mismo bloqueo: ver
 * `createTask` y `addDependency`.
 *
 * `FOR NO KEY UPDATE` y no `FOR UPDATE`: el segundo bloquearía también las
 * comprobaciones de clave foránea de lo que cuelga del proyecto, como agregar un
 * miembro, que no tienen nada que ver con el cronograma.
 */
export const lockSchedule = async (
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<void> => {
  await tx.$queryRaw`SELECT 1 FROM projects WHERE id = ${projectId}::uuid FOR NO KEY UPDATE`;
};

/**
 * Deja las fases en 1..n según el orden recibido, sin huecos.
 *
 * Son dos pasos porque el índice único (project_id, position) no es diferible:
 * Postgres lo comprueba fila a fila, también dentro de una transacción, así que
 * escribir directamente la posición nueva chocaría con la fase que todavía
 * ocupa ese sitio. Pasar antes todas a negativo deja libres las definitivas.
 */
const writePositions = async (
  tx: Prisma.TransactionClient,
  projectId: string,
  orderedIds: string[],
): Promise<void> => {
  await tx.phase.updateMany({ where: { projectId }, data: { position: { multiply: -1 } } });

  for (const [index, id] of orderedIds.entries()) {
    await tx.phase.update({ where: { id }, data: { position: index + 1 } });
  }
};

export const findPhases = (projectId: string): Promise<Phase[]> =>
  prisma.phase.findMany({ where: { projectId }, orderBy: { position: 'asc' } });

/** Filtra también por proyecto: una fase de otro proyecto aquí no existe. */
export const findPhase = (projectId: string, phaseId: string): Promise<Phase | null> =>
  prisma.phase.findFirst({ where: { id: phaseId, projectId } });

export const createPhase = (projectId: string, data: CreatePhaseData): Promise<Phase> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, projectId);

    const { _max } = await tx.phase.aggregate({ where: { projectId }, _max: { position: true } });

    return tx.phase.create({
      data: { ...data, projectId, position: (_max.position ?? 0) + 1 },
    });
  });

export const updatePhase = (phaseId: string, data: UpdatePhaseData): Promise<Phase> =>
  prisma.phase.update({ where: { id: phaseId }, data });

/**
 * Borra y cierra el hueco en la misma transacción: las posiciones siguen en 1..n.
 *
 * Devuelve `false`, sin borrar nada, si la fase tiene tareas. La comprobación va
 * dentro de la transacción y no en el servicio por la misma razón que en
 * `reorderPhases`: tiene que ver el cronograma ya bloqueado.
 */
export const deletePhase = (projectId: string, phaseId: string): Promise<boolean> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, projectId);

    const taskCount = await tx.task.count({ where: { phaseId } });

    if (taskCount > 0) {
      return false;
    }

    await tx.phase.delete({ where: { id: phaseId } });

    const remaining = await tx.phase.findMany({
      where: { projectId },
      select: { id: true },
      orderBy: { position: 'asc' },
    });

    await writePositions(
      tx,
      projectId,
      remaining.map((phase) => phase.id),
    );

    return true;
  });

/**
 * Devuelve `stale` si el orden real no es el que el cliente vio, y `invalid` si la lista
 * no son exactamente las fases del proyecto. En los dos casos no escribe nada.
 *
 * Las comparaciones van aquí y no en el servicio porque tienen que ocurrir con el
 * cronograma bloqueado: hechas antes de la transacción, dos reordenamientos a la vez
 * pasarían los dos, y una fase creada entre medias quedaría fuera de la lista y con una
 * posición repetida.
 */
export const reorderPhases = (
  projectId: string,
  phaseIds: string[],
  expectedPhaseIds?: string[],
): Promise<Phase[] | 'stale' | 'invalid'> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, projectId);

    const current = await tx.phase.findMany({
      where: { projectId },
      select: { id: true },
      orderBy: { position: 'asc' },
    });
    const order = current.map((phase) => phase.id);

    if (expectedPhaseIds && expectedPhaseIds.join() !== order.join()) {
      return 'stale';
    }

    const currentIds = new Set(order);

    const isExactList =
      phaseIds.length === currentIds.size &&
      new Set(phaseIds).size === phaseIds.length &&
      phaseIds.every((id) => currentIds.has(id));

    if (!isExactList) {
      return 'invalid';
    }

    await writePositions(tx, projectId, phaseIds);

    return tx.phase.findMany({ where: { projectId }, orderBy: { position: 'asc' } });
  });
