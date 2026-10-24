// Tipos del contrato de /api/v1/auth, tal como los responde el backend
// (`modules/auth`). Las fechas llegan como texto ISO, que es en lo que las
// convierte el JSON.

/** Eje de alcance en el sistema: `users.system_role`. */
export type SystemRole = 'COORDINATOR' | 'RESEARCHER';

/** Lo que devuelve `toPublicUser()`: nunca trae el hash de la contraseña. */
export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  systemRole: SystemRole;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Respuesta de `POST /auth/iniciar-sesion`. */
export interface AuthSession extends AuthTokens {
  user: PublicUser;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** El rol no viaja: el backend crea siempre `RESEARCHER`. */
export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
}
