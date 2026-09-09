import { compare, hash, hashSync } from 'bcryptjs';
import { SystemRole } from '@prisma/client';
import type { User } from '@prisma/client';
import { AppError } from '../../middlewares/error-handler.js';
import * as repository from './auth.repository.js';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from './auth.tokens.js';
import type { LoginInput, RegisterInput } from './auth.schema.js';

// 10 rondas. Con 12 cada inicio de sesión cuadruplica su coste y el seed
// rehashea seis usuarios en cada corrida, en una máquina de 7,7 GB con Docker
// encima.
const BCRYPT_ROUNDS = 10;

// Hash descartable para gastar el mismo tiempo cuando el correo no existe. Sin
// esto, responder al instante delata qué correos están registrados y cuáles no.
const DUMMY_PASSWORD_HASH = hashSync('cuenta-inexistente', BCRYPT_ROUNDS);

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  systemRole: SystemRole;
  createdAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession extends AuthTokens {
  user: PublicUser;
}

// Mapeo explícito en vez de un `select` en cada consulta: así `passwordHash` no
// puede salir nunca, aunque una consulta futura se olvide de excluirlo.
const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  systemRole: user.systemRole,
  createdAt: user.createdAt,
});

const issueTokens = async (user: User): Promise<AuthTokens> => {
  const refresh = generateRefreshToken();

  await repository.createRefreshToken({
    userId: user.id,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
  });

  return {
    accessToken: signAccessToken({
      sub: user.id,
      email: user.email,
      systemRole: user.systemRole,
    }),
    refreshToken: refresh.token,
  };
};

export const register = async (input: RegisterInput): Promise<PublicUser> => {
  const existing = await repository.findUserByEmail(input.email);

  if (existing) {
    throw new AppError(409, 'CONFLICT', 'El correo ya está registrado');
  }

  const user = await repository.createUser({
    email: input.email,
    passwordHash: await hash(input.password, BCRYPT_ROUNDS),
    fullName: input.fullName,
    // El rol no viene del cliente: quien se registra es investigador. Las
    // cuentas de coordinador salen del seed.
    systemRole: SystemRole.RESEARCHER,
  });

  return toPublicUser(user);
};

export const login = async (input: LoginInput): Promise<AuthSession> => {
  const user = await repository.findUserByEmail(input.email);
  const passwordMatches = await compare(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos');
  }

  // Se comprueba después de validar la contraseña, no antes: distinguir una
  // cuenta desactivada de una inexistente sin credenciales válidas sería otra
  // manera de averiguar qué correos existen.
  if (!user.isActive) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'La cuenta está desactivada');
  }

  const tokens = await issueTokens(user);

  return { user: toPublicUser(user), ...tokens };
};

// En este endpoint no se responde nunca `TOKEN_EXPIRED`: ese código le indica al
// cliente que refresque, y refrescar es justamente lo que acaba de fallar. Aquí
// solo hay un desenlace posible, volver a iniciar sesión.
const invalidRefreshToken = (): AppError =>
  new AppError(401, 'INVALID_TOKEN', 'El token de refresco no es válido');

export const refresh = async (rawToken: string): Promise<AuthTokens> => {
  const stored = await repository.findRefreshTokenByHash(hashRefreshToken(rawToken));

  if (!stored) {
    throw invalidRefreshToken();
  }

  // Un token ya revocado que vuelve a aparecer significa que alguien se quedó
  // con una copia: se cortan todas las sesiones del usuario, no solo esta.
  if (stored.revokedAt) {
    await repository.revokeAllRefreshTokensOfUser(stored.userId);
    throw invalidRefreshToken();
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw invalidRefreshToken();
  }

  if (!stored.user.isActive) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'La cuenta está desactivada');
  }

  const next = generateRefreshToken();

  await repository.rotateRefreshToken(stored.id, {
    userId: stored.userId,
    tokenHash: next.tokenHash,
    expiresAt: next.expiresAt,
  });

  return {
    accessToken: signAccessToken({
      sub: stored.user.id,
      email: stored.user.email,
      systemRole: stored.user.systemRole,
    }),
    refreshToken: next.token,
  };
};

/**
 * Idempotente. Si el token no existe o ya estaba revocado, la sesión igual
 * queda cerrada; decir cuál de los dos casos era solo informaría a quien esté
 * probando tokens ajenos.
 */
export const logout = async (rawToken: string): Promise<void> => {
  const stored = await repository.findRefreshTokenByHash(hashRefreshToken(rawToken));

  if (stored && !stored.revokedAt) {
    await repository.revokeRefreshToken(stored.id);
  }
};

/**
 * Lee el usuario de la base y no del token: el nombre o el rol pueden haber
 * cambiado dentro de los quince minutos de vigencia del access token.
 */
export const getProfile = async (userId: string): Promise<PublicUser> => {
  const user = await repository.findUserById(userId);

  if (!user) {
    throw new AppError(401, 'INVALID_TOKEN', 'El usuario del token ya no existe');
  }

  if (!user.isActive) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'La cuenta está desactivada');
  }

  return toPublicUser(user);
};
