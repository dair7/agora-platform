import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorCode, apiErrorOutcome } from '../../../core/api/api-error';
import type { ApiErrorOutcome } from '../../../core/api/api-error';
import { PhasesApi } from '../../../core/api/phases.api';
import type { Phase } from '../../../core/api/phases.types';
import { TasksApi } from '../../../core/api/tasks.api';
import type {
  CreateTaskInput,
  Task,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput,
} from '../../../core/api/tasks.types';
import { formatProjectPeriod } from '../../../core/format/project-dates';
import { Button } from '../../../shared/ui/button/button';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { Empty } from '../../../shared/ui/empty/empty';
import { FieldSelect } from '../../../shared/ui/field/field';
import { Notice, type NoticeTone } from '../../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { WorkStatusPill, workStatusLabel } from '../../../shared/ui/work-status/work-status';
import { LiveList } from '../live-list';
import { injectProjectContext, refreshOnLiveEvents } from '../project-context';
import { ProjectHeader } from '../project-header/project-header';
import { ProjectTabs } from '../project-tabs/project-tabs';
import { TaskForm, type AssigneeOption } from '../task-form/task-form';

interface ScreenNotice {
  message: string;
  tone: NoticeTone;
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Prioridad baja',
  MEDIUM: 'Prioridad media',
  HIGH: 'Prioridad alta',
};

const STATUS_OPTIONS = (['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'] as const).map(
  (value) => ({ value, label: workStatusLabel(value) }),
);

const DEPENDENCY_MESSAGES = {
  CONFLICT:
    'No se pudo agregar: esa dependencia ya existe o cerraría un ciclo, y las tareas se esperarían entre sí.',
};

const count = (value: number, one: string, many: string): string =>
  `${value} ${value === 1 ? one : many}`;

/**
 * Las tareas del proyecto, agrupadas por fase. Lo que cada quien ve es lo que el backend
 * le dejaría hacer: el investigador principal, todo; quien tiene una tarea asignada,
 * cambiar su estado; nadie más, nada, y en un proyecto cerrado, nadie.
 *
 * Las dependencias siempre se ven. No bloquean el estado: informan, no gobiernan.
 */
@Component({
  selector: 'app-project-tasks',
  imports: [
    Button,
    Dialog,
    Empty,
    FieldSelect,
    LoadingStatus,
    Notice,
    ProjectHeader,
    ProjectTabs,
    RouterLink,
    Skeleton,
    TaskForm,
    WorkStatusPill,
  ],
  templateUrl: './project-tasks.html',
})
export class ProjectTasks {
  readonly #api = inject(TasksApi);
  readonly #phasesApi = inject(PhasesApi);

  protected readonly ctx = injectProjectContext();
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly tasks = new LiveList<Task>(() => this.#api.list(this.ctx.projectId()));
  protected readonly phases = new LiveList<Phase>(() => this.#phasesApi.list(this.ctx.projectId()));

  readonly #titles = computed(
    () => new Map((this.tasks.items() ?? []).map((task) => [task.id, task.title])),
  );

  protected readonly groups = computed(() =>
    (this.phases.items() ?? []).map((phase) => ({
      phase,
      tasks: (this.tasks.items() ?? [])
        .filter((task) => task.phaseId === phase.id)
        .map((task) => ({
          task,
          period: formatProjectPeriod(task.startDate, task.dueDate),
          dependencies: task.dependsOnTaskIds.map((id) => ({
            id,
            title: this.#titles().get(id) ?? 'Tarea sin nombre',
          })),
        })),
    })),
  );

  /** Las cuentas desactivadas no reciben tareas, pero quien ya la tiene debe seguir ahí. */
  protected readonly assignees = computed<AssigneeOption[]>(() => {
    const members = this.ctx.view()?.members ?? [];
    const current = this.form()?.task?.assignee;
    const active = members
      .filter((member) => member.user.isActive)
      .map(({ user }) => ({ id: user.id, label: user.fullName }));

    return current && !active.some((person) => person.id === current.id)
      ? [...active, { id: current.id, label: `${current.fullName} (cuenta desactivada)` }]
      : active;
  });

  protected readonly loading = computed(
    () => this.ctx.project.status() === 'loading' || this.tasks.loading() || this.phases.loading(),
  );

  /** `null` sin error, o si el interceptor ya lo resolvió. */
  protected readonly listError = computed(() => {
    const error = this.tasks.error() ?? this.phases.error();

    if (!error) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  // El formulario. `task` y `phaseId` son una foto: ver `TaskForm`.
  protected readonly form = signal<{ task: Task | null; phaseId: string } | null>(null);
  protected readonly saving = signal(false);
  protected readonly failure = signal<ApiErrorOutcome | null>(null);

  protected readonly notice = signal<ScreenNotice | null>(null);

  // Las dependencias de la tarea abierta.
  protected readonly dependenciesOf = signal<string | null>(null);
  protected readonly dependencyChoice = signal('');
  protected readonly savingDependency = signal(false);

  // Borrar. Se guarda el id y no la tarea: el aviso lee la lista, que se acaba de pedir.
  readonly #deleteId = signal<string | null>(null);
  protected readonly deleting = signal(false);

  protected readonly taskToDelete = computed(
    () => this.tasks.items()?.find((task) => task.id === this.#deleteId()) ?? null,
  );

  /** Lo que se pierde, con números: un aviso genérico no ayuda a decidir. */
  protected readonly deleteWarning = computed(() => {
    const task = this.taskToDelete();

    if (!task) {
      return [];
    }

    const dependents = (this.tasks.items() ?? []).filter((other) =>
      other.dependsOnTaskIds.includes(task.id),
    ).length;
    const linked = [
      ...(task.progressCount > 0 ? [count(task.progressCount, 'avance', 'avances')] : []),
      ...(task.documentCount > 0
        ? [`${count(task.documentCount, 'documento', 'documentos')}, contando cada versión`]
        : []),
    ];

    return [
      'La tarea se borra y no se puede recuperar.',
      ...(linked.length > 0
        ? [
            `Tiene ${linked.join(' y ')}: siguen en el proyecto, pero pierden el vínculo con esta tarea.`,
          ]
        : []),
      ...(dependents > 0
        ? [`${count(dependents, 'tarea depende', 'tareas dependen')} de ella y dejarán de hacerlo.`]
        : []),
    ];
  });

  constructor() {
    effect(() => {
      this.ctx.projectId();

      untracked(() => {
        this.tasks.reset();
        this.phases.reset();
        this.form.set(null);
        this.notice.set(null);
        this.dependenciesOf.set(null);
        void this.tasks.refresh();
        void this.phases.refresh();
      });
    });

    refreshOnLiveEvents(this.ctx, {
      schedule: () => void this.phases.refresh(),
      tasks: () => void this.tasks.refresh(),
    });
  }

  /** Lo mismo que comprueba el backend: el principal, o quien la tiene, en un proyecto abierto. */
  protected canChangeStatus(task: Task): boolean {
    const open = this.ctx.view()?.status !== 'COMPLETED';

    return this.ctx.canManage() || (open && task.assigneeId === this.ctx.userId());
  }

  protected dependencyOptions(task: Task): { id: string; title: string }[] {
    return (this.tasks.items() ?? [])
      .filter((other) => other.id !== task.id && !task.dependsOnTaskIds.includes(other.id))
      .map(({ id, title }) => ({ id, title }));
  }

  protected openCreate(): void {
    this.failure.set(null);
    this.form.set({ task: null, phaseId: this.phases.items()?.[0]?.id ?? '' });
  }

  protected openEdit(task: Task): void {
    this.failure.set(null);
    this.form.set({ task, phaseId: task.phaseId });
  }

  protected closeForm(): void {
    this.form.set(null);
  }

  protected create(input: CreateTaskInput): Promise<void> {
    return this.#save(() => this.#api.create(this.ctx.projectId(), input));
  }

  protected update(input: UpdateTaskInput): Promise<void> {
    const task = this.form()?.task;

    return task
      ? this.#save(() => this.#api.update(this.ctx.projectId(), task.id, input))
      : Promise.resolve();
  }

  async #save(write: () => Promise<Task>): Promise<void> {
    this.saving.set(true);
    this.failure.set(null);

    try {
      await write();
      this.form.set(null);
      await this.tasks.refresh();
    } catch (error) {
      this.failure.set(apiErrorOutcome(error));

      if (apiErrorCode(error) === 'CONFLICT') {
        this.ctx.project.reload();
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** Un rechazo deja el desplegable en lo que dice el servidor, no en lo que se eligió. */
  protected async changeStatus(task: Task, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;

    this.notice.set(null);

    try {
      await this.#api.update(this.ctx.projectId(), task.id, {
        status: select.value as TaskStatus,
      });
      await this.tasks.refresh();
    } catch (error) {
      select.value = task.status;
      this.#showError(error);
      await this.tasks.refresh();
    }
  }

  protected toggleDependencies(task: Task): void {
    this.dependencyChoice.set('');
    this.dependenciesOf.update((current) => (current === task.id ? null : task.id));
  }

  protected async addDependency(task: Task): Promise<void> {
    await this.#writeDependency(async () => {
      await this.#api.addDependency(this.ctx.projectId(), task.id, this.dependencyChoice());
      this.dependencyChoice.set('');
    });
  }

  protected async removeDependency(task: Task, dependsOnId: string): Promise<void> {
    await this.#writeDependency(() =>
      this.#api.removeDependency(this.ctx.projectId(), task.id, dependsOnId),
    );
  }

  async #writeDependency(write: () => Promise<void>): Promise<void> {
    this.savingDependency.set(true);
    this.notice.set(null);

    try {
      await write();
    } catch (error) {
      this.#showError(error, DEPENDENCY_MESSAGES);
    } finally {
      this.savingDependency.set(false);
      await this.tasks.refresh();
    }
  }

  /** Se vuelve a pedir la lista: los números del aviso tienen que ser los de ahora. */
  protected askToDelete(task: Task, dialog: Dialog): void {
    this.#deleteId.set(task.id);
    void this.tasks.refresh();
    dialog.open();
  }

  protected async delete(dialog: Dialog): Promise<void> {
    const task = this.taskToDelete();

    if (!task) {
      dialog.close();
      return;
    }

    this.deleting.set(true);
    this.notice.set(null);

    try {
      await this.#api.remove(this.ctx.projectId(), task.id);
    } catch (error) {
      this.#showError(error);
    } finally {
      this.deleting.set(false);
      dialog.close();
      await this.tasks.refresh();
    }
  }

  #showError(error: unknown, messages?: Parameters<typeof apiErrorOutcome>[1]): void {
    const outcome = apiErrorOutcome(error, messages);

    if (apiErrorCode(error) === 'CONFLICT') {
      this.ctx.project.reload();
    }

    if (outcome.kind !== 'none') {
      this.notice.set({
        message: outcome.message,
        tone: apiErrorCode(error) === 'CONFLICT' ? 'block' : 'error',
      });
    }
  }
}
