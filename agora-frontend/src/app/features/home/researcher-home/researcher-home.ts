import { Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { apiErrorOutcome } from '../../../core/api/api-error';
import { ReportsApi } from '../../../core/api/reports.api';
import type { MyTasksPage } from '../../../core/api/reports.types';
import { formatDueDate } from '../../../core/format/project-dates';
import { formatCount } from '../../../core/format/task-figures';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { Button } from '../../../shared/ui/button/button';
import { Empty } from '../../../shared/ui/empty/empty';
import { Notice } from '../../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { WorkStatusPill } from '../../../shared/ui/work-status/work-status';
import { LiveList } from '../../projects/live-list';
import { Figure } from '../../reports/figure/figure';

/**
 * El inicio de quien investiga: lo pendiente suyo en todos sus proyectos, con lo atrasado
 * primero, que es el orden en que llega. Sin esto hay que entrar proyecto por proyecto.
 *
 * Se apoya en `LiveList` para no perder la lista si falla una recarga. La página va en una
 * lista de un elemento porque trae también las cifras, y las dos tienen que ser de la misma
 * respuesta.
 */
@Component({
  selector: 'app-researcher-home',
  imports: [RouterLink, Button, Empty, Figure, LoadingStatus, Notice, Skeleton, WorkStatusPill],
  templateUrl: './researcher-home.html',
})
export class ResearcherHome {
  readonly #api = inject(ReportsApi);

  protected readonly list = new LiveList<MyTasksPage>(async () => [await this.#api.myTasks()]);
  protected readonly page = computed(() => this.list.items()?.[0] ?? null);

  protected readonly rows = computed(() =>
    (this.page()?.tasks ?? []).map((task) => ({
      task,
      due: task.dueDate ? formatDueDate(task.dueDate) : 'Sin fecha',
    })),
  );

  /**
   * Las dos vienen sumadas del servidor. No hay una tercera: cualquier otra saldría de contar
   * `tasks`, que llega cortada, y con más de 50 pendientes la cifra sería falsa sin avisar.
   */
  protected readonly figures = computed(() => {
    const page = this.page();

    return page && page.total > 0
      ? { pending: formatCount(page.total), overdue: formatCount(page.overdueCount) }
      : null;
  });

  /** Lo que no entra en la lista se dice: un corte que no se ve parece el total. */
  protected readonly truncated = computed(() => {
    const page = this.page();

    return page !== null && page.total > page.tasks.length
      ? `Se muestran las ${page.tasks.length} más urgentes.`
      : null;
  });

  protected readonly errorMessage = computed(() => {
    const error = this.list.error();

    if (!error) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  constructor() {
    const realtime = inject(RealtimeService);

    void this.list.refresh();

    // De cualquiera de sus proyectos: el evento solo llega a sus salas.
    realtime.tasksChanged.pipe(takeUntilDestroyed()).subscribe(() => void this.list.refresh());
    realtime.connected.pipe(takeUntilDestroyed()).subscribe(() => void this.list.refresh());
  }
}
