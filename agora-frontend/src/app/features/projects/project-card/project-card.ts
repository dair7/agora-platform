import { Component, computed, input } from '@angular/core';
import type { ProjectListItem } from '../../../core/api/projects.types';
import { formatProjectPeriod } from '../../../core/format/project-dates';
import { ProjectStatusPill } from '../../../shared/ui/project-status/project-status';

/**
 * Del componente TarjetaProyecto del sistema de diseño: una fila de la lista de
 * proyectos. Título y estado arriba; investigador principal, miembros y periodo
 * abajo. Lo que no cabe en una ojeada no pertenece aquí.
 *
 * TODO(fase 5, detalle): la próxima pieza convierte la tarjeta en un enlace a
 * /proyectos/:projectId. Hasta entonces no es interactiva, aunque el borde ya
 * cambie al sobrevolarla como en el sistema.
 */
@Component({
  selector: 'app-project-card',
  imports: [ProjectStatusPill],
  template: `
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
  `,
  host: {
    class:
      'grid gap-espacio-2 p-espacio-4 bg-superficie-00 border border-borde rounded-radio-md hover:border-veril',
  },
})
export class ProjectCard {
  readonly project = input.required<ProjectListItem>();

  protected readonly lead = computed(() => {
    const { principalInvestigator, memberCount } = this.project();
    const members = `${memberCount} ${memberCount === 1 ? 'miembro' : 'miembros'}`;

    return `${principalInvestigator?.fullName ?? 'Sin investigador principal'} · ${members}`;
  });

  protected readonly period = computed(() =>
    formatProjectPeriod(this.project().startDate, this.project().endDate),
  );
}
