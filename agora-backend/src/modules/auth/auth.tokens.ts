import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { SystemRole } from '@prisma/client';
import { env } from '../../config/env.js';
import { AppError } from '../../middlewares/error-handler.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  systemRole: SystemRole;
}

export interface GeneratedRefreshToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

// `expiresIn` exige el tipo literal `StringValue` de `ms` y del entorno llega un
// `string`. El formato ya lo validó `env.ts` con la misma expresión regular, así
// que la aserción no esconde nada.
const accessTokenOptions: SignOptions = {
  expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
};

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, accessTokenOptions);

const isAccessTokenPayload = (value: unknown): value is AccessTokenPayload => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.sub === 'string' &&
    typeof payload.email === 'string' &&
    typeof payload.systemRole === 'string' &&
    Object.values(SystemRole).includes(payload.systemRole as SystemRole)
  );
};

/**
 * Verifica la firma y la vigencia del access token. No consulta la base de
 * datos: eso es justamente lo que compra un token de quince minutos.
 *
 * Vive aquí y no dentro del middleware porque el handshake de Socket.io tiene
 * que verificar el mismo token sin arrastrar el servicio ni el repositorio.
 */
export const verifyAccessToken = (token: string): AccessTokenPayload => {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'El token de acceso expiró');
    }
    throw new AppError(401, 'INVALID_TOKEN', 'El token de acceso no es válido');
  }

  if (!isAccessTokenPayload(decoded)) {
    throw new AppError(401, 'INVALID_TOKEN', 'El token de acceso no tiene el contenido esperado');
  }

  return decoded;
};

/**
 * SHA-256, no bcrypt. El refresh token son 256 bits aleatorios, no una
 * contraseña: no hay nada que adivinar, así que no necesita sal ni una función
 * lenta. Y `refresh_tokens.token_hash` es UNIQUE, o sea que hay que poder
 * encontrar la fila por el hash; bcrypt, al salar, produce uno distinto cada vez
 * y obligaría a recorrer todos los tokens del usuario comparándolos uno a uno.
 */
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const DURATION = /^(\d+)([smhd])$/;

const UNIT_IN_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

const durationToMs = (duration: string): number => {
  const match = DURATION.exec(duration);

  if (!match) {
    throw new Error(`Duración inválida: ${duration}`);
  }

  const [, amount, unit] = match;

  return Number(amount) * UNIT_IN_MS[unit as keyof typeof UNIT_IN_MS];
};

/** Devuelve el token en claro (viaja al cliente) y su hash (va a la base). */
export const generateRefreshToken = (): GeneratedRefreshToken => {
  const token = randomBytes(32).toString('base64url');

  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + durationToMs(env.REFRESH_TOKEN_EXPIRES_IN)),
  };
};
