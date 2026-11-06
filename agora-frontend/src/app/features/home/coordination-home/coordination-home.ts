import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorOutcome } from '../../../core/api/api-error';
import { ReportsApi } from '../../../core/api/reports.api';
import { Button } from '../../../shared/ui/button/button';
import { Empty } from '../../../shared/ui/empty/empty';
import { Notice } from '../../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { ReportSummary } from '../../reports/report-summary/report-summary';

/** El inicio de la coordinación: las cifras globales, y de ahí a los reportes. */
@Component({
  selector: 'app-coordination-home',
  imports: [RouterLink, Button, Empty, LoadingStatus, Notice, ReportSummary, Skeleton],
  template: `
    <app-loading-status [loading]="summary.status() === 'loading'" />

    <main class="grid gap-espacio-5" [attr.aria-busy]="summary.status() === 'loading' || null">
      <div class="flex flex-wrap items-start justify-between gap-espacio-4">
        <h1 class="titulo-pagina text-tinta">Inicio</h1>
        <!-- En la barra inferior no cabe un quinto destino: los reportes se abren desde aquí. -->
        @if (!noProjects()) {
          <a appButton routerLink="/reportes">Ver reportes</a>
        }
      </div>

      @if (errorMessage(); as message) {
        <app-notice tone="error">
          {{ message }}
          <button
            appButton
            variant="secondary"
            type="button"
            noticeAction
            (click)="summary.reload()"
          >
            Reintentar
          </button>
        </app-notice>
      }

      @if (noProjects()) {
        <app-empty
          title="Todavía no hay proyectos"
          description="Cuando se cree el primero, sus cifras aparecen aquí."
        >
          <a appButton routerLink="/proyectos/nuevo" emptyAction>Crear proyecto</a>
        </app-empty>
      } @else if (value(); as summary) {
        <app-report-summary [summary]="summary" />
      } @else if (summary.status() === 'loading') {
        <div class="grid gap-espacio-4 md:grid-cols-3">
          @for (card of [1, 2, 3]; track card) {
            <div class="grid gap-espacio-2 bg-superficie-00 rounded-radio-md p-espacio-4">
              <app-skeleton class="etiqueta" />
              <app-skeleton class="titulo-pagina" />
            </div>
          }
        </div>
      }
    </main>
  `,
})
export class CoordinationHome {
  readonly #api = inject(ReportsApi);

  protected readonly summary = resource({ loader: () => this.#api.summary() });

  protected readonly value = computed(() =>
    this.summary.hasValue() ? this.summary.value() : null,
  );

  /** Sin proyectos, una pared de ceros no dice nada: la pantalla es una invitación. */
  protected readonly noProjects = computed(() => this.value()?.projects.total === 0);

  protected readonly errorMessage = computed(() => {
    const error = this.summary.error();

    if (!error) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });
}
