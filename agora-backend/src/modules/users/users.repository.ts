import { Prisma, ProjectRole } from '@prisma/client';
import type { SystemRole, User } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { CLOSED_PROJECT_STATUSES } from '../projects/projects.status.js';

interface ListFilters {
  role?: SystemRole;
  search?: string;
  includeInactive: boolean;
}

/**
 * La forma pública de una persona cuando aparece junto a otra cosa: como
 * miembro de un proyecto, como investigador principal en la lista, o en la
 * consulta de la coordinación. Una sola definición para que las tres no se
 * desincronicen.
 *
 * Selección explícita: nunca `include: { user: true }`, que arrastra
 * `password_hash` hasta la respuesta.
 */
export const userSummarySelect = {
  id: true,
  email: true,
  fullName: true,
  systemRole: true,
  isActive: true,
} satisfies Prisma.UserSelect;

export type UserSummary = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;

/**
 * Por defecto solo cuentas activas: una desactivada no puede ser investigador
 * principal, y `createProject` la rechazaría igual. Las inactivas se piden aparte,
 * porque la coordinación no puede reactivar a quien no ve.
 *
 * Sin paginación, a propósito: son decenas de cuentas, no miles.
 */
export const findUsers = (filters: ListFilters): Promise<UserSummary[]> =>
  prisma.user.findMany({
    where: {
      ...(filters.includeInactive ? {} : { isActive: true }),
      ...(filters.role ? { systemRole: filters.role } : {}),
      ...(filters.search
        ? {
            OR: [
              { fullName: { contains: filters.search, mode: 'insensitive' } },
              { email: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: userSummarySelect,
    orderBy: { fullName: 'asc' },
  });

export const findUserByEmail = (email: string): Promise<User | null> =>
  prisma.user.findUnique({ where: { email } });

export const findUserById = (id: string): Promise<User | null> =>
  prisma.user.findUnique({ where: { id } });

export const updateUserName = (id: string, fullName: string): Promise<UserSummary> =>
  prisma.user.update({ where: { id }, data: { fullName }, select: userSummarySelect });

/**
 * Proyectos que dirige y siguen vivos. Uno cancelado no cuenta: ya nadie trabaja
 * en él, aunque el backend solo lo trate como cerrado si está `COMPLETED`.
 */
export const countLedOpenProjects = (userId: string): Promise<number> =>
  prisma.projectMember.count({
    where: {
      userId,
      role: ProjectRole.PRINCIPAL_INVESTIGATOR,
      project: { status: { notIn: CLOSED_PROJECT_STATUSES } },
    },
  });

/**
 * La baja y la revocación van en la misma transacción: una cuenta desactivada
 * que sigue pudiendo renovar su token no está desactivada.
 */
export const deactivateUser = async (id: string): Promise<void> => {
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { isActive: false } }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
};

export const reactivateUser = (id: string): Promise<UserSummary> =>
  prisma.user.update({ where: { id }, data: { isActive: true }, select: userSummarySelect });

/**
 * El hash nuevo y la revocación van en la misma transacción: una contraseña
 * restablecida cuyas sesiones siguen vivas no cierra nada, que es justo para lo
 * que se restablece. Recibe el hash, nunca la contraseña: el texto en claro no
 * baja de la capa de servicio.
 */
export const resetPassword = async (id: string, passwordHash: string): Promise<void> => {
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
};
