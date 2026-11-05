import {
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorCode, apiErrorOutcome } from '../../../core/api/api-error';
import type { ApiErrorOutcome } from '../../../core/api/api-error';
import { PhasesApi } from '../../../core/api/phases.api';
import type { CreatePhaseInput, Phase, UpdatePhaseInput } from '../../../core/api/phases.types';
import { TasksApi } from '../../../core/api/tasks.api';
import type { Task } from '../../../core/api/tasks.types';
import { formatProjectPeriod } from '../../../core/format/project-dates';
import { Button } from '../../../shared/ui/button/button';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { Empty } from '../../../shared/ui/empty/empty';
import { Notice, type NoticeTone } from '../../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { WorkStatusPill } from '../../../shared/ui/work-status/work-status';
import { LiveList } from '../live-list';
import { PhaseForm } from '../phase-form/phase-form';
import { injectProjectContext, refreshOnLiveEvents } from '../project-context';
import { ProjectHeader } from '../project-header/project-header';
import { ProjectTabs } from '../project-tabs/project-tabs';

interface ScreenNotice {
  message: string;
  tone: NoticeTone;
}

const STALE_ORDER =
  'Alguien cambió el proyecto mientras ordenabas el cronograma, y tu cambio no se guardó. Esta es la lista actual: revísala antes de volver a mover.';

const DELETE_MESSAGES = {
  CONFLICT: 'No se pudo borrar: la fase tiene tareas. Muévelas a otra fase o bórralas primero.',
};

/**
 * El cronograma: las fases en orden. Se reordena con subir y bajar, y el orden se manda
 * entero, que es lo que pide el endpoint. Quien no gestiona el proyecto no ve ninguna
 * acción: ni la coordinación, ni un coinvestigador, ni nadie en un proyecto cerrado.
 */
@Component({
  selector: 'app-project-schedule',
  imports: [
    Button,
    Dialog,
    Empty,
    LoadingStatus,
    Notice,
    PhaseForm,
    ProjectHeader,
    ProjectTabs,
    RouterLink,
    Skeleton,
    WorkStatusPill,
  ],
  templateUrl: './project-schedule.html',
})
export class ProjectSchedule {
  readonly #api = inject(PhasesApi);
  readonly #tasksApi = inject(TasksApi);
  readonly #injector = inject(Injector);

  protected readonly ctx = injectProjectContext();

  protected readonly phases = new LiveList<Phase>(() => this.#api.list(this.ctx.projectId()));
  readonly #tasks = new LiveList<Task>(() => this.#tasksApi.list(this.ctx.projectId()));

  protected readonly rows = computed(() =>
    (this.phases.items() ?? []).map((phase) => ({
      phase,
      period: formatProjectPeriod(phase.startDate, phase.endDate),
      taskCount: this.#tasks.items()?.filter((task) => task.phaseId === phase.id).length ?? null,
    })),
  );

  protected readonly loading = computed(
    () => this.ctx.project.status() === 'loading' || this.phases.loading(),
  );

  /** `null` sin error, o si el interceptor ya lo resolvió. */
  protected readonly listError = computed(() => {
    const error = this.phases.error();

    if (!error) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  // El formulario. `phase` es una foto: ver `PhaseForm`.
  protected readonly form = signal<{ phase: Phase | null } | null>(null);
  protected readonly saving = signal(false);
  protected readonly failure = signal<ApiErrorOutcome | null>(null);

  protected readonly notice = signal<ScreenNotice | null>(null);
  protected readonly moving = signal(false);
  protected readonly announcement = signal('');

  protected readonly phaseToDelete = signal<Phase | null>(null);
  protected readonly deleting = signal(false);

  constructor() {
    effect(() => {
      this.ctx.projectId();

      untracked(() => {
        this.phases.reset();
        this.#tasks.reset();
        this.form.set(null);
        this.notice.set(null);
        void this.phases.refresh();
        void this.#tasks.refresh();
      });
    });

    refreshOnLiveEvents(this.ctx, {
      schedule: () => void this.phases.refresh(),
      tasks: () => void this.#tasks.refresh(),
    });
  }

  protected openCreate(): void {
    this.failure.set(null);
    this.form.set({ phase: null });
  }

  protected openEdit(phase: Phase): void {
    this.failure.set(null);
    this.form.set({ phase });
  }

  protected closeForm(): void {
    this.form.set(null);
  }

  protected create(input: CreatePhaseInput): Promise<void> {
    return this.#save(() => this.#api.create(this.ctx.projectId(), input));
  }

  protected update(input: UpdatePhaseInput): Promise<void> {
    const phase = this.form()?.phase;

    return phase
      ? this.#save(() => this.#api.update(this.ctx.projectId(), phase.id, input))
      : Promise.resolve();
  }

  async #save(write: () => Promise<Phase>): Promise<void> {
    this.saving.set(true);
    this.failure.set(null);

    try {
      await write();
      this.form.set(null);
      await this.phases.refresh();
    } catch (error) {
      this.failure.set(apiErrorOutcome(error));

      if (apiErrorCode(error) === 'CONFLICT') {
        this.ctx.project.reload();
      }
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Manda el orden nuevo y el que la persona estaba viendo. Si el real ya no es ese, el
   * backend responde `409` y no escribe nada: alguien lo cambió, o el proyecto se cerró. No
   * se reintenta: se vuelve a pedir y se dice, para que nadie pierda su cambio sin saberlo.
   */
  protected async move(phase: Phase, delta: -1 | 1): Promise<void> {
    const seen = (this.phases.items() ?? []).map((item) => item.id);
    const ids = [...seen];
    const from = ids.indexOf(phase.id);
    const to = from + delta;

    if (from < 0 || to < 0 || to >= ids.length || this.moving()) {
      return;
    }

    [ids[from], ids[to]] = [ids[to], ids[from]];

    this.moving.set(true);
    this.notice.set(null);

    try {
      this.phases.items.set(await this.#api.reorder(this.ctx.projectId(), ids, seen));
      this.announcement.set(`${phase.name} pasó a la posición ${to + 1}`);
      this.#keepFocus(phase.id, delta);
    } catch (error) {
      if (apiErrorCode(error) === 'CONFLICT') {
        await this.phases.refresh();
        this.ctx.project.reload();
        this.notice.set({ message: STALE_ORDER, tone: 'block' });
      } else {
        this.#showError(error);
      }
    } finally {
      this.moving.set(false);
    }
  }

  /** Al llegar a un extremo, el botón pulsado desaparece y el foco se perdería. */
  #keepFocus(phaseId: string, delta: -1 | 1): void {
    afterNextRender(
      () => {
        const [same, other] = delta < 0 ? ['subir', 'bajar'] : ['bajar', 'subir'];

        (
          document.getElementById(`fase-${same}-${phaseId}`) ??
          document.getElementById(`fase-${other}-${phaseId}`)
        )?.focus();
      },
      { injector: this.#injector },
    );
  }

  protected askToDelete(phase: Phase, dialog: Dialog): void {
    this.phaseToDelete.set(phase);
    dialog.open();
  }

  protected async delete(dialog: Dialog): Promise<void> {
    const phase = this.phaseToDelete();

    if (!phase) {
      return;
    }

    this.deleting.set(true);
    this.notice.set(null);

    try {
      await this.#api.remove(this.ctx.projectId(), phase.id);
    } catch (error) {
      this.#showError(error, DELETE_MESSAGES);
    } finally {
      this.deleting.set(false);
      dialog.close();
      await Promise.all([this.phases.refresh(), this.#tasks.refresh()]);
    }
  }

  #showError(error: unknown, messages?: Parameters<typeof apiErrorOutcome>[1]): void {
    const outcome = apiErrorOutcome(error, messages);

    if (outcome.kind !== 'none') {
      this.notice.set({
        message: outcome.message,
        tone: apiErrorCode(error) === 'CONFLICT' ? 'block' : 'error',
      });
    }
  }
}
