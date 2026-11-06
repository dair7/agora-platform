import { Component, computed, input } from '@angular/core';
import type { ReportSummary as Summary } from '../../../core/api/reports.types';
import { formatCount } from '../../../core/format/task-figures';
import { Figure } from '../figure/figure';
import { StatusProportion } from '../status-proportion/status-proportion';

/** Las cifras globales. Las comparten el inicio de la coordinación y los reportes. */
@Component({
  selector: 'app-report-summary',
  imports: [Figure, StatusProportion],
  template: `
    <div class="grid gap-espacio-4 md:grid-cols-3">
      <app-figure label="Proyectos" [value]="projects()" />
      <app-figure label="Tareas atrasadas" [value]="overdue()" [detail]="overdueDetail()" />
      <app-figure label="Tareas completadas" [value]="completed()" [detail]="completedDetail()" />
    </div>

    <section
      aria-labelledby="estados-titulo"
      class="grid gap-espacio-4 bg-superficie-00 rounded-radio-md p-espacio-4 shadow-sombra-tarjeta"
    >
      <h2 id="estados-titulo" class="titulo-tarjeta text-tinta">Proyectos por estado</h2>
      <app-status-proportion
        [byStatus]="summary().projects.byStatus"
        [total]="summary().projects.total"
      />
    </section>
  `,
  host: { class: 'grid gap-espacio-4' },
})
export class ReportSummary {
  readonly summary = input.required<Summary>();

  protected readonly projects = computed(() => formatCount(this.summary().projects.total));
  protected readonly overdue = computed(() => formatCount(this.summary().tasks.overdue));

  protected readonly overdueDetail = computed(() => {
    const { total } = this.summary().tasks;

    return total === 0 ? undefined : `De ${formatCount(total)} en total`;
  });

  protected readonly completed = computed(() => {
    const percent = this.summary().tasks.completedPercent;

    return percent === null ? 'Sin tareas' : `${percent}%`;
  });

  protected readonly completedDetail = computed(() => {
    const { total, completed } = this.summary().tasks;

    return total === 0 ? undefined : `${formatCount(completed)} de ${formatCount(total)}`;
  });
}
