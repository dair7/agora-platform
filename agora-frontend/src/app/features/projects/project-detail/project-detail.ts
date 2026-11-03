import { Component, computed, effect, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { apiErrorCode, apiErrorOutcome } from '../../../core/api/api-error';
import { ProjectsApi } from '../../../core/api/projects.api';
import type { Member, ProjectRole } from '../../../core/api/projects.types';
import { formatBudget } from '../../../core/format/project-budget';
import { formatClosedAt, formatProjectPeriod } from '../../../core/format/project-dates';
import { formatProjectLead } from '../../../core/format/project-lead';
import { Button } from '../../../shared/ui/button/button';
import { Empty } from '../../../shared/ui/empty/empty';
import { Notice } from '../../../shared/ui/notice/notice';
import { ProjectStatusPill } from '../../../shared/ui/project-status/project-status';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';

/**
 * Nombres de función y no de persona, como el rol del armazón: así no hay que
 * adivinar el género de nadie.
 */
const ROLE_LABELS: Record<ProjectRole, string> = {
  PRINCIPAL_INVESTIGATOR: 'Investigación principal',
  CO_INVESTIGATOR: 'Coinvestigación',
};

/** El backend permite guardar `""`; un bloque en blanco parecería un fallo de la pantalla. */
const textOrNull = (value: string | null): string | null => (value?.trim() ? value : null);

/**
 * El detalle de un proyecto: cabecera, resumen y miembros. Solo lectura; las
 * acciones son de la pieza siguiente, y las fases, del cronograma de la fase 12.
 */
@Component({
  selector: 'app-project-detail',
  imports: [Button, Empty, LoadingStatus, Notice, ProjectStatusPill, RouterLink, Skeleton],
  templateUrl: './project-detail.html',
})
export class ProjectDetail {
  readonly #api = inject(ProjectsApi);
  readonly #title = inject(Title);
  protected readonly roleLabels = ROLE_LABELS;

  readonly #params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });

  protected readonly project = resource({
    params: () => this.#params().get('projectId') ?? '',
    loader: ({ params }) => this.#api.get(params),
  });

  /**
   * `NOT_FOUND` y `VALIDATION_ERROR` comparten pantalla y texto, a propósito.
   *
   * El 400 es un identificador mal formado en la URL: en una pantalla sin
   * formulario su error de campo no tiene dónde pintarse. Y para la persona, una
   * URL rota y el proyecto de otro son indistinguibles, y tienen que seguir
   * siéndolo: si la pantalla distinguiera los dos casos, estaría confirmando qué
   * identificadores corresponden a proyectos reales, que es justo lo que la regla
   * de oro esconde al responder 404 y no 403.
   */
  protected readonly notFound = computed(() => {
    const code = apiErrorCode(this.project.error());

    return code === 'NOT_FOUND' || code === 'VALIDATION_ERROR';
  });

  /** Cualquier otro error. `null` si no hay, o si el interceptor ya lo resolvió. */
  protected readonly errorMessage = computed(() => {
    const error = this.project.error();

    if (!error || this.notFound()) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  protected readonly view = computed(() => {
    if (!this.project.hasValue()) {
      return null;
    }

    const project = this.project.value();
    // El investigador principal va primero, explícitamente: no se confía en que
    // el orden por `joinedAt` lo deje arriba.
    const members = [...project.members].sort((a, b) => rank(a) - rank(b));
    const lead = members.find((m) => m.role === 'PRINCIPAL_INVESTIGATOR');

    return {
      project,
      members,
      lead: formatProjectLead(lead?.user.fullName ?? null, members.length),
      period: formatProjectPeriod(project.startDate, project.endDate),
      closedAt:
        project.status === 'COMPLETED' && project.closedAt
          ? formatClosedAt(project.closedAt)
          : null,
      description: textOrNull(project.description),
      objectives: textOrNull(project.objectives),
      budget: formatBudget(project.budget),
    };
  });

  constructor() {
    // El título de la ruta es «Proyecto · Ágora» mientras carga; con el proyecto
    // en la mano pasa a llevar su nombre.
    effect(() => {
      const view = this.view();

      if (view) {
        this.#title.setTitle(`${view.project.title} · Ágora`);
      }
    });
  }
}

const rank = (member: Member): number => (member.role === 'PRINCIPAL_INVESTIGATOR' ? 0 : 1);
