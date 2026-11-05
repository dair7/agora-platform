import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Project } from '../../../core/api/projects.types';
import { Button } from '../../../shared/ui/button/button';
import { ProjectStatusPill } from '../../../shared/ui/project-status/project-status';

/** La cabecera corta de las secciones de un proyecto: de cuál se trata y cómo volver. */
@Component({
  selector: 'app-project-header',
  imports: [Button, ProjectStatusPill, RouterLink],
  template: `
    <header class="grid gap-espacio-2">
      <!-- El margen negativo compensa el relleno lateral del botón discreto. -->
      <div>
        <a appButton variant="subtle" routerLink="/proyectos" class="-ml-espacio-4">
          <span aria-hidden="true" class="mr-espacio-2">←</span>Proyectos
        </a>
      </div>
      <div class="flex flex-wrap items-center gap-x-espacio-3 gap-y-espacio-2">
        <h1 class="titulo-pagina text-tinta">{{ project().title }}</h1>
        <app-project-status class="shrink-0" [status]="project().status" />
      </div>
    </header>
  `,
})
export class ProjectHeader {
  readonly project = input.required<Pick<Project, 'title' | 'status'>>();
}
