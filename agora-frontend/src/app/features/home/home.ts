import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/session/session.service';
import type { SystemRole } from '../../core/session/session.types';
import { Button } from '../../shared/ui/button/button';

const ROLE_LABELS: Record<SystemRole, string> = {
  COORDINATOR: 'Coordinación de investigación',
  RESEARCHER: 'Investigación',
};

@Component({
  selector: 'app-home',
  imports: [RouterLink, Button],
  templateUrl: './home.html',
})
export class Home {
  readonly #router = inject(Router);
  protected readonly session = inject(SessionService);
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly leaving = signal(false);

  protected async logout(): Promise<void> {
    this.leaving.set(true);
    await this.session.logout();
    await this.#router.navigateByUrl('/entrar');
  }
}
