import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { SessionService } from '../../core/session/session.service';
import type { SystemRole } from '../../core/session/session.types';
import { Button } from '../../shared/ui/button/button';
import { Notice } from '../../shared/ui/notice/notice';
import { NotificationInbox } from '../notifications/notification-inbox/notification-inbox';
import { AccountMenu } from './account-menu/account-menu';

/**
 * El rol en palabras, nunca el valor del enum. Son nombres de área y no de
 * persona: el sistema no sabe cómo se nombra cada quien, así que no se adivina
 * «investigadora» o «investigador».
 */
const ROLE_LABELS: Record<SystemRole, string> = {
  COORDINATOR: 'Coordinación',
  RESEARCHER: 'Investigación',
};

/** El `md` de Tailwind: desde aquí, barra superior; por debajo, barra inferior. */
const WIDE_QUERY = '(min-width: 48rem)';

/** Lo que abre el teclado en pantalla. */
const TEXT_ENTRY = 'textarea, input:not([type=checkbox], [type=radio], [type=file])';

/**
 * El armazón de la aplicación con sesión: la barra y la pantalla de la ruta hija. Es el
 * componente de la ruta padre que protege `authGuard`, así que todo lo que cuelga de él
 * ya tiene sesión.
 *
 * La barra se elige con `matchMedia` y no con CSS: la inferior va después del contenido,
 * para que el teclado la recorra donde se ve, y las dos llevan la bandeja. Con CSS habría
 * dos bandejas vivas, cada una con sus peticiones.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    AccountMenu,
    Button,
    Notice,
    NotificationInbox,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  host: {
    '(focusin)': 'onFocusIn($event)',
    '(focusout)': 'typing.set(false)',
  },
})
export class Shell {
  readonly #router = inject(Router);
  protected readonly session = inject(SessionService);
  protected readonly realtime = inject(RealtimeService);
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly leaving = signal(false);

  readonly #wideQuery = window.matchMedia(WIDE_QUERY);
  readonly #touch = window.matchMedia('(pointer: coarse)');
  protected readonly wide = signal(this.#wideQuery.matches);

  /**
   * Con el teclado en pantalla abierto, la barra inferior se queda encima de él y le quita
   * al compositor del chat el alto que le falta. Solo con pantalla táctil: con un teclado
   * físico la barra no estorba, y esconderla la sacaría del recorrido con Tab.
   */
  protected readonly typing = signal(false);

  readonly #url = toSignal(
    this.#router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.#router.url),
    ),
    { initialValue: this.#router.url },
  );

  constructor() {
    const onChange = ({ matches }: MediaQueryListEvent) => this.wide.set(matches);

    this.#wideQuery.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.#wideQuery.removeEventListener('change', onChange));
  }

  /** El aviso de reconexión no promete lo que no hay: solo en el chat se puede escribir. */
  protected readonly canWrite = computed(() => this.#url().endsWith('/conversacion'));

  protected onFocusIn({ target }: FocusEvent): void {
    this.typing.set(
      this.#touch.matches && target instanceof HTMLElement && target.matches(TEXT_ENTRY),
    );
  }

  protected async logout(): Promise<void> {
    this.leaving.set(true);
    await this.session.logout();
    await this.#router.navigateByUrl('/entrar');
  }
}
