import * as repository from './users.repository.js';
import type { UserSummary } from './users.repository.js';
import type { ListUsersQuery } from './users.schema.js';

/**
 * Adelanto de la fase 9: la consulta que necesita el formulario de crear
 * proyecto para elegir al investigador principal. El resto del módulo —alta,
 * edición, baja lógica— llega con la fase 9.
 */
export const listUsers = (query: ListUsersQuery): Promise<UserSummary[]> =>
  repository.findActiveUsers({ role: query.role, search: query.search });
