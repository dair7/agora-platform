import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  REFRESH_TOKEN_KEY,
  SESSION_REQUEST,
  SessionEndedError,
  SessionService,
} from './session.service';

const isRefresh = (url: string) => url.endsWith('/auth/refrescar');

describe('SessionService', () => {
  let session: SessionService;
  let http: HttpTestingController;

  const refreshRequests = (): TestRequest[] => http.match((req) => isRefresh(req.url));

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  describe('coordinación de la renovación', () => {
    it('tres llamadas simultáneas comparten una sola renovación', async () => {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');

      const calls = [session.renew(), session.renew(), session.renew()];

      const requests = refreshRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].request.body).toEqual({ refreshToken: 'refresh-1' });
      expect(requests[0].request.context.get(SESSION_REQUEST)).toBe(true);

      requests[0].flush({ accessToken: 'access-2', refreshToken: 'refresh-2' });

      await expect(Promise.all(calls)).resolves.toEqual(['access-2', 'access-2', 'access-2']);
      expect(session.accessToken).toBe('access-2');
    });

    it('la rotación guarda el refresh token nuevo y la siguiente renovación lo usa', async () => {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');

      const first = session.renew();
      refreshRequests()[0].flush({ accessToken: 'access-2', refreshToken: 'refresh-2' });
      await first;

      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-2');

      // La marca se liberó al terminar: esta es una renovación nueva, con el token rotado.
      const second = session.renew();
      const requests = refreshRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].request.body).toEqual({ refreshToken: 'refresh-2' });

      requests[0].flush({ accessToken: 'access-3', refreshToken: 'refresh-3' });
      await expect(second).resolves.toBe('access-3');
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-3');
    });

    it('una renovación fallida termina la sesión y libera la marca', async () => {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-revocado');

      const calls = [session.renew(), session.renew(), session.renew()];

      const requests = refreshRequests();
      expect(requests).toHaveLength(1);
      requests[0].flush(
        { error: { code: 'INVALID_TOKEN', message: 'El token no es válido' } },
        { status: 401, statusText: 'Unauthorized' },
      );

      // Las tres que esperaban fallan juntas; ninguna se queda colgada.
      for (const call of calls) {
        await expect(call).rejects.toBeInstanceOf(SessionEndedError);
      }
      expect(session.accessToken).toBeNull();
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
      expect(session.isAuthenticated()).toBe(false);

      // La marca quedó libre: con una sesión nueva, la siguiente renovación sale.
      sessionStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-nuevo');
      const next = session.renew();
      const retry = refreshRequests();
      expect(retry).toHaveLength(1);
      retry[0].flush({ accessToken: 'access-9', refreshToken: 'refresh-9' });
      await expect(next).resolves.toBe('access-9');
    });

    it('una caída de red libera la marca pero conserva el refresh token', async () => {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');

      const call = session.renew();
      refreshRequests()[0].error(new ProgressEvent('error'));

      const error: unknown = await call.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect(error).not.toBeInstanceOf(SessionEndedError);
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-1');

      // Sin red no hay motivo para expulsar a nadie: se puede volver a intentar.
      const retry = session.renew();
      refreshRequests()[0].flush({ accessToken: 'access-2', refreshToken: 'refresh-2' });
      await expect(retry).resolves.toBe('access-2');
    });

    it('sin refresh token termina la sesión sin llamar al backend', async () => {
      await expect(session.renew()).rejects.toBeInstanceOf(SessionEndedError);
      http.expectNone((req) => isRefresh(req.url));
    });
  });

  describe('inicio y cierre de sesión', () => {
    it('iniciar sesión guarda el access token en memoria y el refresh token en sessionStorage', async () => {
      const user = {
        id: 'u1',
        email: 'laura.mendoza@example.com',
        fullName: 'Laura Mendoza',
        systemRole: 'RESEARCHER',
        createdAt: '2026-09-04T00:00:00.000Z',
      };

      const login = session.login({ email: user.email, password: 'Investigador123*' });
      http
        .expectOne((req) => req.url.endsWith('/auth/iniciar-sesion'))
        .flush({ user, accessToken: 'access-1', refreshToken: 'refresh-1' });

      await expect(login).resolves.toEqual(user);
      expect(session.accessToken).toBe('access-1');
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-1');
      expect(session.user()).toEqual(user);
    });

    it('cerrar sesión limpia el estado local y revoca el refresh token en el backend', async () => {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');

      const logout = session.logout();

      // El estado local ya está limpio antes de que responda el backend.
      expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
      expect(session.isAuthenticated()).toBe(false);

      const request = http.expectOne((req) => req.url.endsWith('/auth/cerrar-sesion'));
      expect(request.request.body).toEqual({ refreshToken: 'refresh-1' });
      request.flush(null, { status: 204, statusText: 'No Content' });

      await logout;
    });
  });
});
