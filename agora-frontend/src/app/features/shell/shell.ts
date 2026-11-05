import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { SessionService } from '../../core/session/session.service';
import type { SystemRole } from '../../core/session/session.types';
import { Button } from '../../shared/ui/button/button';
import { Notice } from '../../shared/ui/notice/notice';
import { NotificationInbox } from '../notifications/notification-inbox/notification-inbox';

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
  imports: [RouterLink, RouterOutlet, Button, Notice, NotificationInbox],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  readonly #router = inject(Router);
  protected readonly session = inject(SessionService);
  protected readonly realtime = inject(RealtimeService);
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly leaving = signal(false);

  readonly #url = toSignal(
    this.#router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.#router.url),
    ),
    { initialValue: this.#router.url },
  );

  /** El aviso de reconexión no promete lo que no hay: solo en el chat se puede escribir. */
  protected readonly canWrite = computed(() => this.#url().endsWith('/conversacion'));

  protected async logout(): Promise<void> {
    this.leaving.set(true);
    await this.session.logout();
    await this.#router.navigateByUrl('/entrar');
  }
}
