import type { Router } from '@angular/router';
import type { SessionService } from './session.service';

const SESSION_EXPIRED_URL = '/sesion-expirada';

/**
 * La sesión murió con la persona dentro: la termina y la lleva a explicárselo. Es
 * el mismo camino para los dos canales, HTTP y socket, que reaccionan al mismo
 * contrato de errores.
 */
export const expireSession = (session: SessionService, router: Router): void => {
  session.end();

  if (!router.url.startsWith(SESSION_EXPIRED_URL)) {
    void router.navigateByUrl(SESSION_EXPIRED_URL);
  }
};
