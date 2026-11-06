import { Component, computed, input } from '@angular/core';
import type { ProjectStatus } from '../../../core/api/projects.types';
import { formatCount } from '../../../core/format/task-figures';
import {
  PROJECT_STATUSES,
  projectStatusFill,
  projectStatusLabel,
} from '../../../shared/ui/project-status/project-status';

/**
 * La proporción de proyectos por estado. Es la única barra de color del producto, y solo
 * porque estos cinco estados ya lo tienen: el sistema no trae paleta de gráficos.
 *
 * La barra es decorativa: lo que se lee es la lista, y el color acompaña, no reemplaza.
 * Cada tramo tiene su nombre y su cifra al lado, también los que están en cero.
 */
@Component({
  selector: 'app-status-proportion',
  template: `
    @if (total() > 0) {
      <div class="flex gap-espacio-1 h-espacio-3" aria-hidden="true">
        @for (row of rows(); track row.status) {
          @if (row.count > 0) {
            <span
              class="proporcion-tramo rounded-radio-sm"
              [class]="row.fill"
              [style.flex-grow]="row.count"
            ></span>
          }
        }
      </div>
    }

    <ul class="grid gap-y-espacio-2 gap-x-espacio-8 sm:grid-cols-2">
      @for (row of rows(); track row.status) {
        <li class="flex items-center gap-espacio-2">
          <span
            class="size-espacio-3 shrink-0 rounded-radio-sm"
            [class]="row.fill"
            aria-hidden="true"
          ></span>
          <span class="cuerpo text-tinta flex-1">{{ row.label }}</span>
          <span class="dato text-tinta">{{ row.value }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    /* sin token: lo mínimo para que un estado con un solo proyecto no desaparezca */
    .proporcion-tramo {
      flex-basis: 0;
      min-width: 4px;
    }
  `,
  host: { class: 'grid gap-espacio-4' },
})
export class StatusProportion {
  readonly byStatus = input.required<Record<ProjectStatus, number>>();
  readonly total = input.required<number>();

  protected readonly rows = computed(() =>
    PROJECT_STATUSES.map((status) => ({
      status,
      label: projectStatusLabel(status),
      fill: projectStatusFill(status),
      count: this.byStatus()[status],
      value: formatCount(this.byStatus()[status]),
    })),
  );
}
