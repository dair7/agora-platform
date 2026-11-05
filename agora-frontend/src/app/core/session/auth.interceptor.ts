import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { apiErrorCode } from '../api/api-error';
import { expireSession } from './expire-session';
import { SESSION_REQUEST, SessionEndedError, SessionService } from './session.service';

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/**
 * Una petición con `responseType: 'blob'` recibe también su error como `Blob`, y sin leerlo
 * nadie ve el `code`: una descarga con el token vencido no se renovaría, y su `404`
 * llegaría a la pantalla como un error desconocido.
 */
const withReadableBody = async (error: HttpErrorResponse): Promise<HttpErrorResponse> => {
  try {
    return new HttpErrorResponse({
      error: JSON.parse(await (error.error as Blob).text()),
      headers: error.headers,
      status: error.status,
      statusText: error.statusText,
      url: error.url ?? undefined,
    });
  } catch {
    return error;
  }
};

const send = (req: HttpRequest<unknown>, next: HttpHandlerFn) =>
  next(req).pipe(
    catchError((error: unknown) =>
      error instanceof HttpErrorResponse && error.error instanceof Blob
        ? from(withReadableBody(error)).pipe(switchMap((readable) => throwError(() => readable)))
        : throwError(() => error),
    ),
  );

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

  return send(withToken(req, session.accessToken), next).pipe(
    catchError((error: unknown) => {
      if (apiErrorCode(error) !== 'TOKEN_EXPIRED') {
        return throwError(() => error);
      }

      return from(session.renew()).pipe(switchMap((token) => send(withToken(req, token), next)));
    }),
    catchError((error: unknown) => {
      // La sesión terminó: la renovación fue rechazada, o el backend no reconoce
      // el token. Todas las peticiones que esperaban llegan aquí juntas y fallan;
      // ninguna se queda colgada.
      if (error instanceof SessionEndedError || apiErrorCode(error) === 'INVALID_TOKEN') {
        expireSession(session, router);
      }

      return throwError(() => error);
    }),
  );
};
