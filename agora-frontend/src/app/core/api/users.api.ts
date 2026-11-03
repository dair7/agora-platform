import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toQueryParams } from './query-params';
import type { ListUsersQuery, UserSummary } from './users.types';

/**
 * Cliente tipado de `/api/v1/usuarios`. Por ahora solo la consulta que necesita
 * el formulario de crear proyecto para elegir al investigador principal; el
 * resto del módulo llega con la fase 9.
 */
@Injectable({ providedIn: 'root' })
export class UsersApi {
  readonly #http = inject(HttpClient);
  readonly #url = `${environment.apiUrl}/usuarios`;

  /**
   * Solo la coordinación. Solo cuentas activas, por nombre, sin paginación: son
   * decenas de cuentas, no miles.
   */
  async list(query: ListUsersQuery = {}): Promise<UserSummary[]> {
    const { users } = await firstValueFrom(
      this.#http.get<{ users: UserSummary[] }>(this.#url, { params: toQueryParams({ ...query }) }),
    );

    return users;
  }
}
