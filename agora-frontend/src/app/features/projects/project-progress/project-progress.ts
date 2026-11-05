import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorCode, apiErrorOutcome } from '../../../core/api/api-error';
import type { ApiErrorMessages, ApiErrorOutcome } from '../../../core/api/api-error';
import { ProgressApi } from '../../../core/api/progress.api';
import type {
  CreateProgressInput,
  ProgressEntry,
  UpdateProgressInput,
} from '../../../core/api/progress.types';
import { TasksApi } from '../../../core/api/tasks.api';
import type { Task } from '../../../core/api/tasks.types';
import { formatMoment } from '../../../core/format/message-dates';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { Button } from '../../../shared/ui/button/button';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { Empty } from '../../../shared/ui/empty/empty';
import { Notice, type NoticeTone } from '../../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { LiveList } from '../live-list';
import { ProgressForm } from '../progress-form/progress-form';
import { injectProjectContext, refreshOnLiveEvents } from '../project-context';
import { ProjectHeader } from '../project-header/project-header';
import { ProjectTabs } from '../project-tabs/project-tabs';

interface ScreenNotice {
  message: string;
  tone: NoticeTone;
}

const SAVE_MESSAGES: ApiErrorMessages = {
  NOT_FOUND: 'Ese avance o su tarea ya no existen. Revisa la lista.',
  CONFLICT: 'El proyecto se cerró y ya no admite cambios.',
};

const DELETE_MESSAGES: ApiErrorMessages = {
  NOT_FOUND: 'Ese avance ya no existe.',
  CONFLICT: 'El proyecto se cerró y ya no admite cambios.',
};

/**
 * El historial de avances del proyecto, lo más reciente primero. Cada quien ve lo que el
 * backend le dejaría hacer: registrar, cualquier miembro; editar, solo quien lo escribió,
 * también frente al investigador principal; borrar, quien lo escribió o el principal. La
 * coordinación lee, y en un proyecto cerrado nadie escribe.
 */
@Component({
  selector: 'app-project-progress',
  imports: [
    Avatar,
    Button,
    Dialog,
    Empty,
    LoadingStatus,
    Notice,
    ProgressForm,
    ProjectHeader,
    ProjectTabs,
    RouterLink,
    Skeleton,
  ],
  templateUrl: './project-progress.html',
})
export class ProjectProgress {
  readonly #api = inject(ProgressApi);
  readonly #tasksApi = inject(TasksApi);

  protected readonly ctx = injectProjectContext();

  protected readonly entries = new LiveList<ProgressEntry>(() =>
    this.#api.list(this.ctx.projectId()),
  );
  readonly #tasks = new LiveList<Task>(() => this.#tasksApi.list(this.ctx.projectId()));

  protected readonly taskOptions = computed(() =>
    (this.#tasks.items() ?? []).map(({ id, title }) => ({ id, title })),
  );

  readonly #titles = computed(
    () => new Map(this.taskOptions().map((task) => [task.id, task.title])),
  );

  protected readonly rows = computed(() =>
    (this.entries.items() ?? []).map((entry) => ({
      entry,
      moment: formatMoment(entry.createdAt),
      task: entry.taskId ? (this.#titles().get(entry.taskId) ?? 'Una tarea') : null,
      canEdit: this.ctx.canContribute() && entry.authorId === this.ctx.userId(),
      canDelete:
        this.ctx.canContribute() && (entry.authorId === this.ctx.userId() || this.ctx.canManage()),
    })),
  );

  protected readonly loading = computed(
    () => this.ctx.project.status() === 'loading' || this.entries.loading(),
  );

  /** `null` sin error, o si el interceptor ya lo resolvió. */
  protected readonly listError = computed(() => {
    const error = this.entries.error();

    if (!error) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  // El formulario. `entry` es una foto: ver `ProgressForm`.
  protected readonly form = signal<{ entry: ProgressEntry | null } | null>(null);
  protected readonly saving = signal(false);
  protected readonly failure = signal<ApiErrorOutcome | null>(null);

  protected readonly notice = signal<ScreenNotice | null>(null);

  protected readonly entryToDelete = signal<ProgressEntry | null>(null);
  protected readonly deleting = signal(false);

  constructor() {
    effect(() => {
      this.ctx.projectId();

      untracked(() => {
        this.entries.reset();
        this.#tasks.reset();
        this.form.set(null);
        this.notice.set(null);
        void this.entries.refresh();
        void this.#tasks.refresh();
      });
    });

    refreshOnLiveEvents(this.ctx, {
      progress: () => void this.entries.refresh(),
      // Borrar una tarea suelta sus avances: el vínculo también cambió.
      tasks: () => {
        void this.#tasks.refresh();
        void this.entries.refresh();
      },
    });
  }

  protected openCreate(): void {
    this.failure.set(null);
    this.form.set({ entry: null });
  }

  protected openEdit(entry: ProgressEntry): void {
    this.failure.set(null);
    this.form.set({ entry });
  }

  protected closeForm(): void {
    this.form.set(null);
  }

  protected create(input: CreateProgressInput): Promise<void> {
    return this.#save(() => this.#api.create(this.ctx.projectId(), input));
  }

  protected update(input: UpdateProgressInput): Promise<void> {
    const entry = this.form()?.entry;

    return entry
      ? this.#save(() => this.#api.update(this.ctx.projectId(), entry.id, input))
      : Promise.resolve();
  }

  async #save(write: () => Promise<ProgressEntry>): Promise<void> {
    this.saving.set(true);
    this.failure.set(null);

    try {
      await write();
      this.form.set(null);
      await this.entries.refresh();
    } catch (error) {
      this.failure.set(apiErrorOutcome(error, SAVE_MESSAGES));

      if (apiErrorCode(error) === 'CONFLICT') {
        this.ctx.project.reload();
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected askToDelete(entry: ProgressEntry, dialog: Dialog): void {
    this.entryToDelete.set(entry);
    dialog.open();
  }

  protected async delete(dialog: Dialog): Promise<void> {
    const entry = this.entryToDelete();

    if (!entry) {
      return;
    }

    this.deleting.set(true);
    this.notice.set(null);

    try {
      await this.#api.remove(this.ctx.projectId(), entry.id);
    } catch (error) {
      const outcome = apiErrorOutcome(error, DELETE_MESSAGES);

      if (apiErrorCode(error) === 'CONFLICT') {
        this.ctx.project.reload();
      }

      if (outcome.kind !== 'none') {
        this.notice.set({
          message: outcome.message,
          tone: apiErrorCode(error) === 'CONFLICT' ? 'block' : 'error',
        });
      }
    } finally {
      this.deleting.set(false);
      dialog.close();
      await this.entries.refresh();
    }
  }
}
