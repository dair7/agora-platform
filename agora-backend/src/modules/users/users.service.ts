import type { User } from '@prisma/client';
import { AppError } from '../../middlewares/error-handler.js';
import { hashPassword } from '../auth/auth.service.js';
import { disconnectUser } from '../../sockets/emitter.js';
import * as repository from './users.repository.js';
import type { UserSummary } from './users.repository.js';
import type { ListUsersQuery, ResetPasswordInput, UpdateUserInput } from './users.schema.js';

const getUser = async (userId: string): Promise<User> => {
  const user = await repository.findUserById(userId);

  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'La cuenta no existe');
  }

  return user;
};

export const listUsers = (query: ListUsersQuery): Promise<UserSummary[]> =>
  repository.findUsers(query);

export const updateUser = async (userId: string, input: UpdateUserInput): Promise<UserSummary> => {
  await getUser(userId);

  return repository.updateUserName(userId, input.fullName);
};

/**
 * Baja lógica, nunca `DELETE`: el `Restrict` del esquema no deja borrar a quien
 * tiene autoría, y así debe ser.
 */
export const deactivateUser = async (actorId: string, userId: string): Promise<void> => {
  const user = await getUser(userId);

  if (userId === actorId) {
    throw new AppError(409, 'CONFLICT', 'No puedes desactivar tu propia cuenta');
  }

  if (!user.isActive) {
    throw new AppError(409, 'CONFLICT', 'La cuenta ya está desactivada');
  }

  // Dejar un proyecto vivo sin quien lo gestione es el mismo problema que retirar
  // al investigador principal, y allí también es 409.
  if ((await repository.countLedOpenProjects(userId)) > 0) {
    throw new AppError(
      409,
      'CONFLICT',
      'Esta persona dirige proyectos abiertos: tiene que cerrarlos o traspasarlos antes de la baja',
    );
  }

  await repository.deactivateUser(userId);

  // Después de persistir: si volviera a conectarse antes de que la baja esté
  // guardada, nada la sacaría.
  disconnectUser(userId);
};

/**
 * Restablece la contraseña de otra persona. Sirve también con una cuenta
 * desactivada: la coordinación puede dejarla lista antes de reactivarla, y si no
 * pudiera, reactivar devolvería el acceso con la contraseña que se quiso retirar.
 * Los refresh tokens de una baja ya están revocados y revocar de nuevo no cambia nada.
 */
export const resetPassword = async (
  actorId: string,
  userId: string,
  input: ResetPasswordInput,
): Promise<void> => {
  await getUser(userId);

  // Para la propia contraseña no hay atajo por la coordinación: cerraría sus
  // sesiones, la sacaría del sistema, y es un cambio que la persona debe poder
  // hacer por su cuenta, que hoy no existe.
  if (userId === actorId) {
    throw new AppError(409, 'CONFLICT', 'No puedes restablecer tu propia contraseña');
  }

  await repository.resetPassword(userId, await hashPassword(input.password));

  // Después de persistir, como la baja. Su access token sigue valiendo hasta quince
  // minutos, pero ya no puede renovarlo.
  disconnectUser(userId);
};

/**
 * Una baja lógica sin vuelta es una trampa. Va por su propio endpoint y no por un
 * campo, igual que cerrar un proyecto. Los refresh tokens revocados siguen
 * revocados: la persona vuelve a iniciar sesión.
 */
export const reactivateUser = async (userId: string): Promise<UserSummary> => {
  const user = await getUser(userId);

  if (user.isActive) {
    throw new AppError(409, 'CONFLICT', 'La cuenta ya está activa');
  }

  return repository.reactivateUser(userId);
};
