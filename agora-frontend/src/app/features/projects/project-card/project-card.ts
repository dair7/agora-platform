import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectListItem } from '../../../core/api/projects.types';
import { formatProjectPeriod } from '../../../core/format/project-dates';
import { formatProjectLead } from '../../../core/format/project-lead';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { ProjectStatusPill } from '../../../shared/ui/project-status/project-status';
import { UnreadBadge } from '../../../shared/ui/unread-badge/unread-badge';

/**
 * Del componente TarjetaProyecto del sistema de diseño: una fila de la lista de
 * proyectos y la puerta a su detalle. Título y estado arriba; investigador
 * principal, miembros y periodo abajo. Lo que no cabe en una ojeada no pertenece aquí.
 *
 * La tarjeta entera es el enlace, así que el anillo de foco la rodea completa.
 */
@Component({
  selector: 'app-project-card',
  imports: [ProjectStatusPill, RouterLink, UnreadBadge],
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
        @if (period() || unread()) {
          <span class="tabular-nums sm:shrink-0">
            @if (unread(); as unread) {
              <app-unread-badge class="mr-espacio-2" [count]="unread" />
            }
            {{ period() }}
          </span>
        }
      </div>
    </a>
  `,
  host: { class: 'block' },
})
export class ProjectCard {
  readonly #realtime = inject(RealtimeService);

  readonly project = input.required<ProjectListItem>();

  protected readonly unread = computed(() => this.#realtime.unreadIn(this.project().id));

  protected readonly lead = computed(() => {
    const { principalInvestigator, memberCount } = this.project();

    return formatProjectLead(principalInvestigator?.fullName ?? null, memberCount);
  });

  protected readonly period = computed(() =>
    formatProjectPeriod(this.project().startDate, this.project().endDate),
  );
}
