import { Prisma, ProjectStatus, TaskStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { AuthUser } from '../../middlewares/authenticate.js';
import { visibleProjectsFilter } from '../projects/projects.repository.js';
import { CLOSED_PROJECT_STATUSES } from '../projects/projects.status.js';

/**
 * Todo agregado se calcula en la base: pedir listas y sumar funciona con tres proyectos y
 * revienta con cincuenta.
 *
 * `tasks` no tiene columna de proyecto: el proyecto de una tarea es el de su fase.
 */
const tasksOf = (user: AuthUser): Prisma.TaskWhereInput => ({
  phase: { project: visibleProjectsFilter(user) },
});

/** Un proyecto en pausa sigue abierto: es temporal, y la fecha que pasó, pasó. */
const inOpenProject: Prisma.TaskWhereInput = {
  phase: { project: { status: { notIn: CLOSED_PROJECT_STATUSES } } },
};

/**
 * Atrasada: fecha de fin anterior a hoy, sin terminar y en un proyecto abierto. Hoy mismo
 * todavía no lo está. En un proyecto cerrado no hay nada que hacer con ella.
 */
const overdue = (today: string): Prisma.TaskWhereInput => ({
  AND: [inOpenProject, { status: { not: TaskStatus.DONE }, dueDate: { lt: new Date(today) } }],
});

export const countProjectsByStatus = async (
  user: AuthUser,
): Promise<{ status: ProjectStatus; count: number }[]> => {
  const rows = await prisma.project.groupBy({
    by: ['status'],
    where: visibleProjectsFilter(user),
    _count: { _all: true },
  });

  return rows.map((row) => ({ status: row.status, count: row._count._all }));
};

export interface TaskCounts {
  total: number;
  completed: number;
  overdue: number;
}

export const countTasks = async (user: AuthUser, today: string): Promise<TaskCounts> => {
  const scope = tasksOf(user);

  // Juntas, para que las tres cifras sean de la misma foto.
  const [total, completed, late] = await prisma.$transaction([
    prisma.task.count({ where: scope }),
    prisma.task.count({ where: { AND: [scope, { status: TaskStatus.DONE }] } }),
    prisma.task.count({ where: { AND: [scope, overdue(today)] } }),
  ]);

  return { total, completed, overdue: late };
};

export interface ProjectFiguresRow extends TaskCounts {
  id: string;
  title: string;
  status: ProjectStatus;
}

interface Pagination {
  page: number;
  perPage: number;
}

interface RawFiguresRow {
  id: string;
  title: string;
  status: ProjectStatus;
  total: number;
  completed: number;
  overdue: number;
}

/**
 * Prisma no agrupa por una relación, y una tarea llega al proyecto por su fase, así que el
 * agregado va en SQL. `LEFT JOIN`: un proyecto sin tareas también sale, con ceros.
 */
const figuresOf = (
  projectIds: string[],
  today: string,
  { page, perPage }: Pagination,
): Promise<RawFiguresRow[]> =>
  prisma.$queryRaw<RawFiguresRow[]>`
    SELECT
      p.id,
      p.title,
      p.status::text AS status,
      COUNT(t.id)::int AS total,
      (COUNT(t.id) FILTER (WHERE t.status = 'DONE'))::int AS completed,
      (COUNT(t.id) FILTER (
        WHERE t.status <> 'DONE'
          AND t.due_date < ${today}::date
          AND p.status::text <> ALL(${CLOSED_PROJECT_STATUSES}::text[])
      ))::int AS overdue
    FROM projects p
    LEFT JOIN phases ph ON ph.project_id = p.id
    LEFT JOIN tasks t ON t.phase_id = ph.id
    WHERE p.id = ANY(${projectIds}::uuid[])
    GROUP BY p.id
    ORDER BY overdue DESC, p.title ASC, p.id ASC
    LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
  `;

/**
 * Los proyectos visibles los resuelve `visibleProjectsFilter`, y el SQL recibe sus
 * identificadores: la regla de oro tiene una sola traducción, y un `EXISTS` escrito aquí
 * sería la segunda. Lo que se trae son identificadores, no filas que sumar.
 */
export const findProjectFigures = async (
  user: AuthUser,
  today: string,
  pagination: Pagination,
): Promise<[ProjectFiguresRow[], number]> => {
  const visible = await prisma.project.findMany({
    where: visibleProjectsFilter(user),
    select: { id: true },
  });
  const ids = visible.map(({ id }) => id);

  return [await figuresOf(ids, today, pagination), ids.length];
};

/** De un solo proyecto. El acceso ya lo resolvió `requireProjectMember`. */
export const findOneProjectFigures = async (
  projectId: string,
  today: string,
): Promise<ProjectFiguresRow | undefined> => {
  const [row] = await figuresOf([projectId], today, { page: 1, perPage: 1 });

  return row;
};

const myTaskSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  phase: {
    select: {
      id: true,
      name: true,
      project: { select: { id: true, title: true, status: true } },
    },
  },
} satisfies Prisma.TaskSelect;

export type MyTaskRow = Prisma.TaskGetPayload<{ select: typeof myTaskSelect }>;

/**
 * Lo pendiente de una persona en sus proyectos abiertos: lo de un proyecto cerrado no se
 * puede hacer, y dejarlo aquí enseña a no mirar la lista. Ordenar por fecha ya deja las
 * atrasadas primero: su fecha es anterior a hoy. Las que no tienen fecha, al final.
 */
export const findMyTasks = async (
  user: AuthUser,
  today: string,
  limit: number,
): Promise<[MyTaskRow[], number, number]> => {
  const where: Prisma.TaskWhereInput = {
    AND: [tasksOf(user), inOpenProject, { assigneeId: user.id, status: { not: TaskStatus.DONE } }],
  };

  return prisma.$transaction([
    prisma.task.findMany({
      where,
      select: myTaskSelect,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    }),
    prisma.task.count({ where }),
    prisma.task.count({ where: { AND: [where, overdue(today)] } }),
  ]);
};
