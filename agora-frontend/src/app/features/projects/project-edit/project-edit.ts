import { Component, computed, effect, inject, resource, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { apiErrorCode, apiErrorOutcome, type ApiErrorOutcome } from '../../../core/api/api-error';
import { ProjectsApi } from '../../../core/api/projects.api';
import type { UpdateProjectInput } from '../../../core/api/projects.types';
import { SessionService } from '../../../core/session/session.service';
import { Button } from '../../../shared/ui/button/button';
import { Notice } from '../../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { ProjectForm, toFormValues } from '../project-form/project-form';
import { canManageProject } from '../project-permissions';

/**
 * Editar proyecto. No lleva guard: ser investigador principal depende del proyecto,
 * y eso no se sabe sin pedirlo. Lo decide esta pantalla al cargarlo.
 *
 * Quien no puede editar va al detalle, sin mensaje. A quien ve el proyecto, el
 * detalle es su sitio: decirle que no existe sería mentirle sin proteger nada. A
 * quien no lo ve, el detalle le da la pantalla de no encontrado, así que un
 * proyecto ajeno y una URL rota siguen siendo indistinguibles aquí también.
 */
@Component({
  selector: 'app-project-edit',
  imports: [Button, LoadingStatus, Notice, ProjectForm, Skeleton],
  template: `
    <app-loading-status [loading]="project.isLoading()" />

    <main
      class="grid gap-espacio-5 mx-auto max-w-ancho-formulario"
      [attr.aria-busy]="project.isLoading() || null"
    >
      <h1 class="titulo-pagina text-tinta">Editar proyecto</h1>

      @if (errorMessage(); as message) {
        <app-notice tone="error">
          {{ message }}
          <button
            appButton
            variant="secondary"
            type="button"
            noticeAction
            (click)="project.reload()"
          >
            Reintentar
          </button>
        </app-notice>
      } @else if (values(); as values) {
        <app-project-form
          mode="edit"
          [initial]="values"
          [busy]="saving()"
          [failure]="failure()"
          (updated)="save($event)"
          (cancelled)="backToDetail()"
        />
      } @else {
        <div class="bg-superficie-00 rounded-radio-md p-espacio-4 grid gap-espacio-4">
          @for (field of [1, 2, 3]; track field) {
            <div class="grid gap-espacio-1">
              <app-skeleton width="espacio-8" class="etiqueta" />
              <app-skeleton class="cuerpo" />
            </div>
          }
        </div>
      }
    </main>
  `,
})
export class ProjectEdit {
  readonly #router = inject(Router);
  readonly #api = inject(ProjectsApi);
  readonly #session = inject(SessionService);

  readonly #params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });
  readonly #projectId = computed(() => this.#params().get('projectId') ?? '');

  protected readonly project = resource({
    params: () => this.#projectId(),
    loader: ({ params }) => this.#api.get(params),
  });

  /** `NOT_FOUND`, o un identificador mal formado: los dos los resuelve el detalle. */
  readonly #notVisible = computed(() => {
    const code = apiErrorCode(this.project.error());

    return code === 'NOT_FOUND' || code === 'VALIDATION_ERROR';
  });

  /** `null` hasta saber que quien mira puede editar: el formulario no se pinta antes. */
  protected readonly values = computed(() => {
    if (!this.project.hasValue()) {
      return null;
    }

    const project = this.project.value();

    return canManageProject(project, this.#session.user()?.id) ? toFormValues(project) : null;
  });

  /** Cualquier otro error. `null` si no hay, o si el interceptor ya lo resolvió. */
  protected readonly errorMessage = computed(() => {
    const error = this.project.error();

    if (!error || this.#notVisible()) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  protected readonly saving = signal(false);
  protected readonly failure = signal<ApiErrorOutcome | null>(null);

  constructor() {
    effect(() => {
      const cannotEdit = this.project.hasValue() && this.values() === null;

      if (cannotEdit || this.#notVisible()) {
        // `replaceUrl`: con volver atrás se saldría del detalle para rebotar aquí.
        void this.#router.navigate(['/proyectos', this.#projectId()], { replaceUrl: true });
      }
    });
  }

  protected async save(input: UpdateProjectInput): Promise<void> {
    this.saving.set(true);
    this.failure.set(null);

    try {
      await this.#api.update(this.#projectId(), input);
      await this.#router.navigate(['/proyectos', this.#projectId()], { replaceUrl: true });
    } catch (error) {
      this.failure.set(apiErrorOutcome(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected backToDetail(): void {
    void this.#router.navigate(['/proyectos', this.#projectId()]);
  }
}
