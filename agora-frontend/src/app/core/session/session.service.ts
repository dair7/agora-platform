import { HttpClient, HttpContext, HttpContextToken, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { apiErrorCode } from '../api/api-error';
import type {
  AuthSession,
  AuthTokens,
  LoginInput,
  PublicUser,
  RegisterInput,
} from './session.types';

/**
 * Marca las peticiones de la propia sesión (iniciar, registrar, refrescar,
 * cerrar). El interceptor no las toca: si el `401` de `/refrescar` se pusiera a
 * esperar una renovación, se estaría esperando a sí mismo.
 */
export const SESSION_REQUEST = new HttpContextToken<boolean>(() => false);

const sessionRequest = () => ({ context: new HttpContext().set(SESSION_REQUEST, true) });

/** La renovación no fue posible y la sesión terminó: hay que volver a entrar. */
export class SessionEndedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('La sesión terminó', options);
    this.name = 'SessionEndedError';
  }
}

export const REFRESH_TOKEN_KEY = 'agora.refreshToken';

/**
 * El refresh token vive en `sessionStorage`, por pestaña: sobrevive a una recarga
 * y cada pestaña tiene su propia sesión. Leer o escribir puede lanzar con el
 * almacenamiento bloqueado; en ese caso la sesión se queda solo en memoria.
 */
const refreshTokenStore = {
  read(): string | null {
    try {
      return sessionStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  write(token: string | null): void {
    try {
      if (token) {
        sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    } catch {
      // Sin almacenamiento la sesión sigue en memoria y se pierde al recargar.
    }
  },
};

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly #http = inject(HttpClient);
  readonly #url = `${environment.apiUrl}/auth`;

  readonly #user = signal<PublicUser | null>(null);
  /** Solo en memoria, nunca en almacenamiento. */
  #accessToken: string | null = null;
  /** La renovación en curso, compartida por todos los que la necesiten. */
  #renewal: Promise<string> | null = null;

  readonly user = this.#user.asReadonly();
  readonly isAuthenticated = computed(() => this.#user() !== null);

  get accessToken(): string | null {
    return this.#accessToken;
  }

  async login(input: LoginInput): Promise<PublicUser> {
    const session = await firstValueFrom(
      this.#http.post<AuthSession>(`${this.#url}/iniciar-sesion`, input, sessionRequest()),
    );

    this.#storeTokens(session);
    this.#user.set(session.user);

    return session.user;
  }

  /** Crea la cuenta y no inicia sesión: `/registro` no devuelve tokens a propósito. */
  async register(input: RegisterInput): Promise<PublicUser> {
    const { user } = await firstValueFrom(
      this.#http.post<{ user: PublicUser }>(`${this.#url}/registro`, input, sessionRequest()),
    );

    return user;
  }

  /**
   * La sesión local termina primero, para que la interfaz responda al instante.
   * Revocar en el backend es idempotente; si falla (sin red), el refresh token
   * caduca solo a los siete días.
   */
  async logout(): Promise<void> {
    const refreshToken = refreshTokenStore.read();

    this.end();

    if (!refreshToken) {
      return;
    }

    try {
      await firstValueFrom(
        this.#http.post<void>(`${this.#url}/cerrar-sesion`, { refreshToken }, sessionRequest()),
      );
    } catch {
      // La sesión local ya terminó; no hay nada que mostrar.
    }
  }

  /**
   * Devuelve un access token nuevo. Una sola renovación a la vez: quien llegue
   * mientras hay una en curso recibe esa misma. No es una optimización:
   * `/refrescar` rota el token, y una segunda renovación en paralelo llegaría con
   * un refresh token ya revocado, que el backend toma por robo y castiga
   * revocando todas las sesiones de la persona.
   *
   * La marca se quita en `finally`: también cuando la renovación falla. Si solo
   * se quitara al salir bien, una renovación fallida dejaría a todas las
   * peticiones siguientes esperando algo que nunca llega.
   */
  renew(): Promise<string> {
    this.#renewal ??= this.#startRenewal().finally(() => {
      this.#renewal = null;
    });

    return this.#renewal;
  }

  /**
   * Recupera la sesión al cargar la aplicación: si la pestaña conserva su
   * refresh token, renueva y vuelve a leer el perfil.
   */
  async restore(): Promise<void> {
    if (!refreshTokenStore.read()) {
      return;
    }

    try {
      await this.renew();

      const { user } = await firstValueFrom(
        this.#http.get<{ user: PublicUser }>(`${this.#url}/perfil`),
      );

      this.#user.set(user);
    } catch {
      // Sin sesión que recuperar: la persona vuelve a iniciar sesión.
    }
  }

  /** Termina la sesión local: sin tokens y sin usuario. */
  end(): void {
    this.#accessToken = null;
    refreshTokenStore.write(null);
    this.#user.set(null);
  }

  async #startRenewal(): Promise<string> {
    const refreshToken = refreshTokenStore.read();

    if (!refreshToken) {
      this.end();
      throw new SessionEndedError();
    }

    try {
      const tokens = await firstValueFrom(
        this.#http.post<AuthTokens>(`${this.#url}/refrescar`, { refreshToken }, sessionRequest()),
      );

      // La rotación: el refresh token usado ya está revocado, así que se guarda
      // el nuevo antes de entregar el access token.
      this.#storeTokens(tokens);

      return tokens.accessToken;
    } catch (error) {
      // Un rechazo del backend es definitivo: el token no sirve. Una caída de red
      // o un 500 no: el refresh token puede seguir valiendo, así que se conserva.
      if (apiErrorCode(error) === 'INVALID_TOKEN' || isUnauthorized(error)) {
        this.end();
        throw new SessionEndedError({ cause: error });
      }

      throw error;
    }
  }

  #storeTokens(tokens: AuthTokens): void {
    this.#accessToken = tokens.accessToken;
    refreshTokenStore.write(tokens.refreshToken);
  }
}

const isUnauthorized = (error: unknown): boolean =>
  error instanceof HttpErrorResponse && error.status === 401;
