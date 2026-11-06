import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toQueryParams } from './query-params';
import type { ListUsersQuery, UserSummary } from './users.types';

/**
 * Cliente tipado de `/api/v1/usuarios`, todo de la coordinación. Crear una cuenta no
 * está aquí: la ruta cuelga de `/auth` y vive en `AccountsApi`.
 */
@Injectable({ providedIn: 'root' })
export class UsersApi {
  readonly #http = inject(HttpClient);
  readonly #url = `${environment.apiUrl}/usuarios`;

  /**
   * Por nombre, sin paginación: son decenas de cuentas, no miles. Sin
   * `incluirInactivas`, solo las activas.
   */
  async list(query: ListUsersQuery = {}): Promise<UserSummary[]> {
    const { incluirInactivas, ...rest } = query;
    const { users } = await firstValueFrom(
      this.#http.get<{ users: UserSummary[] }>(this.#url, {
        params: toQueryParams({ ...rest, incluirInactivas: incluirInactivas ? 'true' : undefined }),
      }),
    );

    return users;
  }

  /** Del nombre y nada más: el backend responde 400 a cualquier otra clave. */
  async rename(userId: string, fullName: string): Promise<UserSummary> {
    const { user } = await firstValueFrom(
      this.#http.patch<{ user: UserSummary }>(`${this.#url}/${userId}`, { fullName }),
    );

    return user;
  }

  /** Baja lógica: cierra las sesiones de la cuenta. `204`, sin cuerpo. */
  async deactivate(userId: string): Promise<void> {
    await firstValueFrom(this.#http.delete<void>(`${this.#url}/${userId}`));
  }

  async reactivate(userId: string): Promise<UserSummary> {
    const { user } = await firstValueFrom(
      this.#http.post<{ user: UserSummary }>(`${this.#url}/${userId}/reactivar`, {}),
    );

    return user;
  }

  /**
   * Fija una contraseña nueva y cierra las sesiones de la cuenta. `204`, sin cuerpo: la
   * contraseña no vuelve en ninguna respuesta, así que quien la manda es quien la conoce.
   */
  async resetPassword(userId: string, password: string): Promise<void> {
    await firstValueFrom(
      this.#http.post<void>(`${this.#url}/${userId}/restablecer-contrasena`, { password }),
    );
  }
}
