import type { RefreshToken, SystemRole, User } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

interface CreateUserData {
  email: string;
  passwordHash: string;
  fullName: string;
  systemRole: SystemRole;
}

interface CreateRefreshTokenData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export const findUserByEmail = (email: string): Promise<User | null> =>
  prisma.user.findUnique({ where: { email } });

export const findUserById = (id: string): Promise<User | null> =>
  prisma.user.findUnique({ where: { id } });

export const createUser = (data: CreateUserData): Promise<User> => prisma.user.create({ data });

export const createRefreshToken = async (data: CreateRefreshTokenData): Promise<void> => {
  await prisma.refreshToken.create({ data });
};

export const findRefreshTokenByHash = (
  tokenHash: string,
): Promise<(RefreshToken & { user: User }) | null> =>
  prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });

export const revokeRefreshToken = async (id: string): Promise<void> => {
  await prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
};

/** Se usa al detectar la reutilización de un token ya revocado. */
export const revokeAllRefreshTokensOfUser = async (userId: string): Promise<void> => {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

/**
 * Revocar el token usado y crear el que lo reemplaza van en la misma
 * transacción: si la segunda escritura falla, la sesión no puede quedar cerrada
 * sin que el cliente haya recibido el token nuevo.
 */
export const rotateRefreshToken = async (
  currentId: string,
  next: CreateRefreshTokenData,
): Promise<void> => {
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: currentId }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({ data: next }),
  ]);
};
