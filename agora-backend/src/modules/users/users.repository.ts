import { Prisma } from '@prisma/client';
import type { SystemRole } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

interface ListFilters {
  role?: SystemRole;
  search?: string;
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
 * Solo cuentas activas: una desactivada no puede ser investigador principal, y
 * `createProject` la rechazaría igual.
 *
 * Sin paginación, a propósito: son decenas de cuentas, no miles.
 */
export const findActiveUsers = (filters: ListFilters): Promise<UserSummary[]> =>
  prisma.user.findMany({
    where: {
      isActive: true,
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
