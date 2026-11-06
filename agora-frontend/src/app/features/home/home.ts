import { Component, computed, inject } from '@angular/core';
import { SessionService } from '../../core/session/session.service';
import { CoordinationHome } from './coordination-home/coordination-home';
import { ResearcherHome } from './researcher-home/researcher-home';

/** Donde se aterriza al entrar. Es distinto para cada rol: cada uno viene a algo distinto. */
@Component({
  selector: 'app-home',
  imports: [CoordinationHome, ResearcherHome],
  template: `
    @if (isCoordinator()) {
      <app-coordination-home />
    } @else {
      <app-researcher-home />
    }
  `,
})
export class Home {
  readonly #session = inject(SessionService);

  protected readonly isCoordinator = computed(
    () => this.#session.user()?.systemRole === 'COORDINATOR',
  );
}
