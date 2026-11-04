import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { SessionService } from '../../core/session/session.service';
import type { SystemRole } from '../../core/session/session.types';
import { Button } from '../../shared/ui/button/button';
import { Notice } from '../../shared/ui/notice/notice';

/**
 * El rol en palabras, nunca el valor del enum. Son nombres de área y no de
 * persona: el sistema no sabe cómo se nombra cada quien, así que no se adivina
 * «investigadora» o «investigador».
 */
const ROLE_LABELS: Record<SystemRole, string> = {
  COORDINATOR: 'Coordinación',
  RESEARCHER: 'Investigación',
};

/**
 * El armazón de la aplicación con sesión: la barra superior y, debajo, la
 * pantalla de la ruta hija. Es el componente de la ruta padre que protege
 * `authGuard`, así que todo lo que cuelga de él ya tiene sesión.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterOutlet, Button, Notice],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  readonly #router = inject(Router);
  protected readonly session = inject(SessionService);
  protected readonly realtime = inject(RealtimeService);
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly leaving = signal(false);

  protected async logout(): Promise<void> {
    this.leaving.set(true);
    await this.session.logout();
    await this.#router.navigateByUrl('/entrar');
  }
}
