import { Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiErrorOutcome } from '../../core/api/api-error';
import { ReportsApi } from '../../core/api/reports.api';
import { formatCompleted, formatOverdue } from '../../core/format/task-figures';
import { Button } from '../../shared/ui/button/button';
import { Empty } from '../../shared/ui/empty/empty';
import { Notice } from '../../shared/ui/notice/notice';
import { ProjectStatusPill } from '../../shared/ui/project-status/project-status';
import { LoadingStatus, Skeleton } from '../../shared/ui/skeleton/skeleton';
import { ReportSummary } from './report-summary/report-summary';

/**
 * Los reportes de la coordinación: las cifras globales y, debajo, cada proyecto con lo más
 * atrasado primero. La página vive en la URL, como en la lista de proyectos.
 *
 * Es una foto: la coordinación no entra a las salas, y recarga para ver lo nuevo.
 */
@Component({
  selector: 'app-reports',
  imports: [
    RouterLink,
    Button,
    Empty,
    LoadingStatus,
    Notice,
    ProjectStatusPill,
    ReportSummary,
    Skeleton,
  ],
  templateUrl: './reports.html',
})
export class Reports {
  readonly #api = inject(ReportsApi);
  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute);

  readonly #queryParams = toSignal(this.#route.queryParamMap, { requireSync: true });

  protected readonly pageNumber = computed(() => {
    const page = Number(this.#queryParams().get('pagina'));

    return Number.isInteger(page) && page > 0 ? page : 1;
  });

  protected readonly summary = resource({ loader: () => this.#api.summary() });
  protected readonly projects = resource({
    params: () => this.pageNumber(),
    loader: ({ params }) => this.#api.projects(params),
  });

  protected readonly summaryValue = computed(() =>
    this.summary.hasValue() ? this.summary.value() : null,
  );

  protected readonly page = computed(() =>
    this.projects.hasValue() ? this.projects.value() : null,
  );

  /** Sin proyectos, una pared de ceros no dice nada: la pantalla es una invitación. */
  protected readonly noProjects = computed(() => this.summaryValue()?.projects.total === 0);

  protected readonly rows = computed(() =>
    (this.page()?.items ?? []).map((project) => ({
      project,
      completed: formatCompleted(project.tasks),
      overdue: project.tasks.overdue > 0 ? formatOverdue(project.tasks.overdue) : null,
    })),
  );

  protected readonly pageCount = computed(() => {
    const page = this.page();

    return page ? Math.max(1, Math.ceil(page.total / page.perPage)) : 1;
  });

  protected readonly loading = computed(
    () => this.summary.status() === 'loading' || this.projects.status() === 'loading',
  );

  protected readonly errorMessage = computed(() => {
    const error = this.summary.error() ?? this.projects.error();

    if (!error) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  protected reload(): void {
    this.summary.reload();
    this.projects.reload();
  }

  protected goToPage(pagina: number): void {
    void this.#router.navigate([], { relativeTo: this.#route, queryParams: { pagina } });
  }
}
