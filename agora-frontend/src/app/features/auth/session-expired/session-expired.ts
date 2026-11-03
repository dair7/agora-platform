import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from '../../../shared/ui/button/button';

/**
 * Pantalla de sesión expirada. La abre el interceptor cuando la sesión termina
 * sin que la persona la cerrara; para entonces `SessionService.end()` ya borró
 * los tokens, así que no queda nada que limpiar aquí.
 */
@Component({
  selector: 'app-session-expired',
  imports: [Button],
  templateUrl: './session-expired.html',
})
export class SessionExpired {
  readonly #router = inject(Router);

  protected signInAgain(): void {
    void this.#router.navigateByUrl('/entrar');
  }
}
