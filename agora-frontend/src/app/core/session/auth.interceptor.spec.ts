import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { apiErrorCode } from '../api/api-error';
import { authInterceptor } from './auth.interceptor';
import { SESSION_REQUEST, SessionEndedError, SessionService } from './session.service';

type Settled =
  | { status: 'fulfilled'; value: unknown }
  | { status: 'rejected'; reason: unknown }
  | { status: 'pending' };

/**
 * Varios de estos casos, escritos mal, no fallan: se quedan colgados. Una prueba
 * que solo esperara el `reject` no terminaría nunca, así que se comprueba si la
 * promesa terminó o sigue pendiente.
 */
const settle = (promise: Promise<unknown>, ms = 50): Promise<Settled> =>
  Promise.race([
    promise.then(
      (value) => ({ status: 'fulfilled', value }) as const,
      (reason: unknown) => ({ status: 'rejected', reason }) as const,
    ),
    new Promise<Settled>((resolve) => setTimeout(() => resolve({ status: 'pending' }), ms)),
  ]);

/** Deja correr la cadena renovación → repetición hasta que sale la petición nueva. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const unauthorized = (code: string) =>
  [{ error: { code, message: code } }, { status: 401, statusText: 'Unauthorized' }] as const;

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let session: SessionService;
  let navigate: ReturnType<typeof vi.spyOn>;

  const isRefresh = (req: TestRequest) => req.request.url.endsWith('/auth/refrescar');
  const refreshRequests = () => backend.match((req) => req.url.endsWith('/auth/refrescar'));
  const projectRequests = () => backend.match((req) => req.url === '/api/v1/proyectos');
  const getProjects = () => firstValueFrom(http.get<string[]>('/api/v1/proyectos'));

  /** Deja una sesión iniciada con access-1 / refresh-1. */
  const signIn = async () => {
    const login = session.login({ email: 'laura.mendoza@example.com', password: 'x' });
    backend
      .expectOne((req) => req.url.endsWith('/auth/iniciar-sesion'))
      .flush({
        user: {
          id: 'u1',
          email: 'laura.mendoza@example.com',
          fullName: 'Laura Mendoza',
          systemRole: 'RESEARCHER',
          createdAt: '2026-09-04T00:00:00.000Z',
        },
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
      });
    await login;
  };

  beforeEach(async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await signIn();
  });

  afterEach(() => {
    sessionStorage.clear();
    try {
      // Ninguna petición sin atender: aquí se detecta una repetición de más.
      backend.verify();
    } finally {
      // Si `verify` falla, el módulo se reinicia igual: sin esto, cada prueba
      // siguiente fallaría al configurarse y taparía cuál es el fallo real.
      TestBed.resetTestingModule();
    }
  });

  it('pone el access token en la cabecera Authorization', async () => {
    const call = getProjects();
    const req = backend.expectOne('/api/v1/proyectos');
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush(['P1']);
    await expect(call).resolves.toEqual(['P1']);
  });

  it('ante TOKEN_EXPIRED renueva y repite la petición con el token nuevo', async () => {
    const call = getProjects();
    backend.expectOne('/api/v1/proyectos').flush(...unauthorized('TOKEN_EXPIRED'));

    refreshRequests()[0].flush({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    await tick();

    const retry = backend.expectOne('/api/v1/proyectos');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
    retry.flush(['P1']);

    await expect(call).resolves.toEqual(['P1']);
  });

  it('tres peticiones vencidas a la vez comparten una sola renovación', async () => {
    const calls = [getProjects(), getProjects(), getProjects()];
    for (const req of projectRequests()) req.flush(...unauthorized('TOKEN_EXPIRED'));

    const refreshes = refreshRequests();
    expect(refreshes).toHaveLength(1);
    refreshes[0].flush({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    await tick();

    const retries = projectRequests();
    expect(retries).toHaveLength(3);
    for (const retry of retries) {
      expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
      retry.flush(['P1']);
    }
    await expect(Promise.all(calls)).resolves.toEqual([['P1'], ['P1'], ['P1']]);
  });

  describe('los cuatro casos del criterio de cierre', () => {
    it('1. si la renovación falla, todas las que esperaban fallan juntas y van a sesión expirada', async () => {
      const calls = [getProjects(), getProjects(), getProjects()];
      for (const req of projectRequests()) req.flush(...unauthorized('TOKEN_EXPIRED'));

      refreshRequests()[0].flush(...unauthorized('INVALID_TOKEN'));

      for (const call of calls) {
        const result = await settle(call);
        expect(result.status).toBe('rejected');
        expect((result as { reason: unknown }).reason).toBeInstanceOf(SessionEndedError);
      }
      expect(session.isAuthenticated()).toBe(false);
      expect(navigate).toHaveBeenCalledWith('/sesion-expirada');
      // afterEach: ninguna de las tres se repitió.
    });

    it('2. la marca de "renovando" se quita también cuando la renovación falla', async () => {
      // Una renovación que falla por la red: no termina la sesión, pero tiene que
      // liberar la marca, o las peticiones siguientes esperarían para siempre.
      const first = getProjects();
      backend.expectOne('/api/v1/proyectos').flush(...unauthorized('TOKEN_EXPIRED'));
      refreshRequests()[0].error(new ProgressEvent('error'));

      expect((await settle(first)).status).toBe('rejected');

      const second = getProjects();
      backend.expectOne('/api/v1/proyectos').flush(...unauthorized('TOKEN_EXPIRED'));

      // Si la marca hubiera quedado puesta, no saldría una renovación nueva.
      const refreshes = refreshRequests();
      expect(refreshes).toHaveLength(1);
      refreshes[0].flush({ accessToken: 'access-2', refreshToken: 'refresh-2' });
      await tick();

      backend.expectOne('/api/v1/proyectos').flush(['P1']);
      expect(await settle(second)).toEqual({ status: 'fulfilled', value: ['P1'] });
    });

    it('3. cada petición se repite una sola vez: un segundo 401 es un error, no otra renovación', async () => {
      const call = getProjects();
      backend.expectOne('/api/v1/proyectos').flush(...unauthorized('TOKEN_EXPIRED'));
      refreshRequests()[0].flush({ accessToken: 'access-2', refreshToken: 'refresh-2' });
      await tick();

      backend.expectOne('/api/v1/proyectos').flush(...unauthorized('TOKEN_EXPIRED'));

      const result = await settle(call);
      expect(result.status).toBe('rejected');
      const reason = (result as { reason: unknown }).reason;
      expect(reason).toBeInstanceOf(HttpErrorResponse);
      expect(apiErrorCode(reason)).toBe('TOKEN_EXPIRED');
      // Ni una segunda renovación ni una tercera petición.
      backend.expectNone((req) => req.url.endsWith('/auth/refrescar'));
    });

    it('4. la llamada a /refrescar no pasa por esta lógica: su 401 no se espera a sí mismo', async () => {
      const renewal = session.renew();

      const refresh = refreshRequests()[0];
      expect(isRefresh(refresh)).toBe(true);
      expect(refresh.request.headers.has('Authorization')).toBe(false);
      // `/refrescar` no responde TOKEN_EXPIRED, pero si un 401 con ese código
      // llegara al interceptor, pediría la renovación en curso: esta misma.
      refresh.flush(...unauthorized('TOKEN_EXPIRED'));

      const result = await settle(renewal);
      expect(result.status).toBe('rejected');
      backend.expectNone((req) => req.url.endsWith('/auth/refrescar'));
    });
  });

  it('INVALID_TOKEN en una petición normal termina la sesión y lleva a sesión expirada', async () => {
    const call = getProjects();
    backend.expectOne('/api/v1/proyectos').flush(...unauthorized('INVALID_TOKEN'));

    expect((await settle(call)).status).toBe('rejected');
    expect(session.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/sesion-expirada');
    backend.expectNone((req) => req.url.endsWith('/auth/refrescar'));
  });

  it('las peticiones de la sesión salen sin Authorization', async () => {
    const call = firstValueFrom(
      http.post(
        '/api/v1/auth/cerrar-sesion',
        {},
        {
          context: new HttpContext().set(SESSION_REQUEST, true),
        },
      ),
    );
    const req = backend.expectOne('/api/v1/auth/cerrar-sesion');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(null);
    await call;
  });
});
