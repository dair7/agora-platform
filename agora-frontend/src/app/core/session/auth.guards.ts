import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { SessionService } from './session.service';
import type { SystemRole } from './session.types';

// Son `canMatch` y no `canActivate`: una ruta que no coincide ni siquiera
// descarga su pantalla. La sesión ya está resuelta cuando corren, porque
// `restore()` va en el inicializador de la aplicación, antes de la primera
// navegación.

/** Rutas con sesión. Sin ella, a iniciar sesión. */
export const authGuard: CanMatchFn = () =>
  inject(SessionService).isAuthenticated() || inject(Router).parseUrl('/entrar');

/** Entrar y registrarse son para quien no tiene sesión: con ella, al inicio. */
export const guestGuard: CanMatchFn = () =>
  !inject(SessionService).isAuthenticated() || inject(Router).parseUrl('/inicio');

/**
 * Autorización por `users.system_role`, el gemelo de `authorize` en el backend.
 * Va dentro de una ruta con `authGuard`.
 *
 * Al rol equivocado la ruta no le coincide: el router sigue buscando y cae en la
 * ruta comodín, igual que con una dirección que no existe. No se redirige a un
 * "no tienes permiso", que confirmaría que la pantalla está ahí.
 */
export const roleGuard =
  (...roles: SystemRole[]): CanMatchFn =>
  () => {
    const user = inject(SessionService).user();

    return user !== null && roles.includes(user.systemRole);
  };
