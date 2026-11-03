import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { PublicUser } from '../session/session.types';

/**
 * Cuerpo de `POST /auth/registro`. No lleva rol: el backend crea siempre una
 * cuenta `RESEARCHER`, y cualquier otra clave la descarta.
 */
export interface CreateAccountInput {
  email: string;
  /** De 8 a 72 caracteres: bcrypt trunca a 72 bytes. */
  password: string;
  fullName: string;
}

/**
 * Creación de cuentas, que es de la coordinación. Vive aparte de `SessionService`
 * aunque la ruta cuelgue de `/auth`: no abre sesión, es una llamada de dominio
 * con el token de quien la hace, y por eso sí pasa por el interceptor.
 */
@Injectable({ providedIn: 'root' })
export class AccountsApi {
  readonly #http = inject(HttpClient);
  readonly #url = `${environment.apiUrl}/auth`;

  async create(input: CreateAccountInput): Promise<PublicUser> {
    const { user } = await firstValueFrom(
      this.#http.post<{ user: PublicUser }>(`${this.#url}/registro`, input),
    );

    return user;
  }
}
