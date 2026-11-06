// Tipos del contrato de /api/v1/usuarios (`modules/users`).

import type { SystemRole } from '../session/session.types';

/**
 * La forma pública de una persona junto a otra cosa: como miembro de un
 * proyecto, como investigador principal en la lista, o en la consulta de la
 * coordinación. En el backend es `userSummarySelect`; nunca trae el hash de la
 * contraseña.
 */
export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  systemRole: SystemRole;
  isActive: boolean;
}

/** Parámetros de `GET /usuarios`, con los nombres en español del contrato. */
export interface ListUsersQuery {
  rol?: SystemRole;
  /** Compara contra nombre y correo sin distinguir mayúsculas. Hasta 200 caracteres. */
  buscar?: string;
  /** Sin esto, solo cuentas activas: la coordinación no puede reactivar a quien no ve. */
  incluirInactivas?: boolean;
}
