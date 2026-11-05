import type { User } from '@prisma/client';
import { AppError } from '../../middlewares/error-handler.js';
import { disconnectUser } from '../../sockets/emitter.js';
import * as repository from './users.repository.js';
import type { UserSummary } from './users.repository.js';
import type { ListUsersQuery, UpdateUserInput } from './users.schema.js';

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
