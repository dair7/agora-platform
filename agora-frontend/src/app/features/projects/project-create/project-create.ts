import { Component, computed, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { apiErrorOutcome, type ApiErrorOutcome } from '../../../core/api/api-error';
import { ProjectsApi } from '../../../core/api/projects.api';
import type { CreateProjectInput } from '../../../core/api/projects.types';
import { UsersApi } from '../../../core/api/users.api';
import { ProjectForm } from '../project-form/project-form';

/**
 * Crear proyecto, solo para la coordinación. Se encarga de los datos y de a dónde
 * se va después; el formulario es `ProjectForm`.
 */
@Component({
  selector: 'app-project-create',
  imports: [ProjectForm],
  template: `
    <main class="grid gap-espacio-5 mx-auto max-w-ancho-formulario">
      <h1 class="titulo-pagina text-tinta">Crear proyecto</h1>
      <app-project-form
        mode="create"
        [leads]="leads()"
        [leadsLoading]="researchers.isLoading()"
        [leadsError]="leadsError()"
        [busy]="saving()"
        [failure]="failure()"
        (created)="create($event)"
        (cancelled)="cancel()"
        (retryLeads)="researchers.reload()"
      />
    </main>
  `,
})
export class ProjectCreate {
  readonly #router = inject(Router);
  readonly #projects = inject(ProjectsApi);
  readonly #users = inject(UsersApi);

  protected readonly researchers = resource({
    loader: () => this.#users.list({ rol: 'RESEARCHER' }),
  });

  protected readonly leads = computed(() =>
    this.researchers.hasValue() ? this.researchers.value() : [],
  );

  protected readonly leadsError = computed(() => {
    const error = this.researchers.error();

    if (!error) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  protected readonly saving = signal(false);
  protected readonly failure = signal<ApiErrorOutcome | null>(null);

  protected async create(input: CreateProjectInput): Promise<void> {
    this.saving.set(true);
    this.failure.set(null);

    try {
      const project = await this.#projects.create(input);

      // `replaceUrl`: volver atrás desde el detalle no debe ofrecer el formulario
      // de un proyecto que ya existe.
      await this.#router.navigate(['/proyectos', project.id], { replaceUrl: true });
    } catch (error) {
      this.failure.set(apiErrorOutcome(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    void this.#router.navigate(['/proyectos']);
  }
}
