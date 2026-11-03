import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectListItem } from '../../../core/api/projects.types';
import { formatProjectPeriod } from '../../../core/format/project-dates';
import { formatProjectLead } from '../../../core/format/project-lead';
import { ProjectStatusPill } from '../../../shared/ui/project-status/project-status';

/**
 * Del componente TarjetaProyecto del sistema de diseño: una fila de la lista de
 * proyectos y la puerta a su detalle. Título y estado arriba; investigador
 * principal, miembros y periodo abajo. Lo que no cabe en una ojeada no pertenece aquí.
 *
 * La tarjeta entera es el enlace, así que el anillo de foco la rodea completa.
 */
@Component({
  selector: 'app-project-card',
  imports: [ProjectStatusPill, RouterLink],
  template: `
    <a
      class="grid gap-espacio-2 p-espacio-4 bg-superficie-00 border border-borde rounded-radio-md hover:border-veril"
      [routerLink]="['/proyectos', project().id]"
    >
      <div class="flex items-start justify-between gap-espacio-3">
        <h2 class="titulo-tarjeta text-tinta">{{ project().title }}</h2>
        <app-project-status class="shrink-0" [status]="project().status" />
      </div>
      <!-- En pantalla estrecha se apila en dos líneas en vez de desbordarse. -->
      <div
        class="secundario text-tinta-media flex flex-col sm:flex-row sm:justify-between sm:gap-espacio-3"
      >
        <span>{{ lead() }}</span>
        @if (period()) {
          <span class="tabular-nums sm:shrink-0">{{ period() }}</span>
        }
      </div>
    </a>
  `,
  host: { class: 'block' },
})
export class ProjectCard {
  readonly project = input.required<ProjectListItem>();

  protected readonly lead = computed(() => {
    const { principalInvestigator, memberCount } = this.project();

    return formatProjectLead(principalInvestigator?.fullName ?? null, memberCount);
  });

  protected readonly period = computed(() =>
    formatProjectPeriod(this.project().startDate, this.project().endDate),
  );
}
