import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { apiErrorCode } from '../api/api-error';
import { SESSION_REQUEST, SessionEndedError, SessionService } from './session.service';

const SESSION_EXPIRED_URL = '/sesion-expirada';

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/**
 * Pone el access token en cada petición y hace el refresco silencioso.
 *
 * Ante `TOKEN_EXPIRED` pide un token a `SessionService.renew()`, que coordina:
 * si varias peticiones vencen a la vez, todas esperan la misma renovación. Cada
 * petición se repite **una sola vez**, y no por una marca sino por la forma del
 * flujo: el primer `catchError` solo ve el error de la petición original; la
 * repetición va dentro del `switchMap`, así que su error ya no vuelve a él.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Las peticiones de la propia sesión pasan tal cual. Si el 401 de `/refrescar`
  // pidiera una renovación, recibiría la que está en curso: la suya, y se
  // quedaría esperándose a sí misma.
  if (req.context.get(SESSION_REQUEST)) {
    return next(req);
  }

  const session = inject(SessionService);
  const router = inject(Router);

  return next(withToken(req, session.accessToken)).pipe(
    catchError((error: unknown) => {
      if (apiErrorCode(error) !== 'TOKEN_EXPIRED') {
        return throwError(() => error);
      }

      return from(session.renew()).pipe(switchMap((token) => next(withToken(req, token))));
    }),
    catchError((error: unknown) => {
      // La sesión terminó: la renovación fue rechazada, o el backend no reconoce
      // el token. Todas las peticiones que esperaban llegan aquí juntas y fallan;
      // ninguna se queda colgada.
      if (error instanceof SessionEndedError || apiErrorCode(error) === 'INVALID_TOKEN') {
        session.end();

        if (!router.url.startsWith(SESSION_EXPIRED_URL)) {
          void router.navigateByUrl(SESSION_EXPIRED_URL);
        }
      }

      return throwError(() => error);
    }),
  );
};
