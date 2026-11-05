import {
  Component,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import type { ApiErrorOutcome } from '../../../core/api/api-error';
import type { Phase } from '../../../core/api/phases.types';
import type {
  CreateTaskInput,
  Task,
  TaskPriority,
  TaskStatus,
  UpdateTaskInput,
} from '../../../core/api/tasks.types';
import { Button } from '../../../shared/ui/button/button';
import { Field, FieldInput, FieldSelect, FieldTextarea } from '../../../shared/ui/field/field';
import { Notice } from '../../../shared/ui/notice/notice';
import { workStatusLabel } from '../../../shared/ui/work-status/work-status';

interface TaskFormValues {
  phaseId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Vacío es «sin responsable». */
  assigneeId: string;
  startDate: string;
  dueDate: string;
}

type FieldName = keyof TaskFormValues;
type FieldMessages = Partial<Record<FieldName, string>>;

export interface AssigneeOption {
  id: string;
  label: string;
}

const toValues = (task: Task | null, phaseId: string): TaskFormValues => ({
  phaseId: task?.phaseId ?? phaseId,
  title: task?.title ?? '',
  description: task?.description ?? '',
  status: task?.status ?? 'TODO',
  priority: task?.priority ?? 'MEDIUM',
  assigneeId: task?.assigneeId ?? '',
  // Como texto, sin pasar por un `Date`: llegan a medianoche UTC.
  startDate: task?.startDate?.slice(0, 10) ?? '',
  dueDate: task?.dueDate?.slice(0, 10) ?? '',
});

const STATUS_OPTIONS = (['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'] as const).map(
  (value) => ({ value, label: workStatusLabel(value) }),
);

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'LOW', label: 'Baja' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
];

const INCOMPLETE_DATE = 'La fecha está incompleta. Complétala o bórrala.';

/**
 * Crear o editar una tarea, para el investigador principal. Asignar y desasignar es el
 * desplegable de responsable, y mover de fase, el de fase. Quien tiene la tarea asignada
 * no pasa por aquí: su único cambio es el estado, que va en la lista.
 *
 * Quien lo usa le pasa una foto de la tarea, por lo mismo que en `PhaseForm`. Las listas
 * de fases y de personas sí pueden cambiar con un evento: los desplegables siguen en lo
 * que la persona eligió, porque `[selected]` solo se reescribe si cambia su valor.
 */
@Component({
  selector: 'app-task-form',
  imports: [Button, Field, FieldInput, FieldSelect, FieldTextarea, Notice],
  templateUrl: './task-form.html',
  host: { class: 'block' },
})
export class TaskForm {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** `null` para crear. */
  readonly task = input<Task | null>(null);
  /** La fase que viene elegida al crear. */
  readonly defaultPhaseId = input('');
  readonly phases = input.required<readonly Phase[]>();
  readonly assignees = input.required<readonly AssigneeOption[]>();
  readonly busy = input(false);
  readonly failure = input<ApiErrorOutcome | null>(null);

  readonly created = output<CreateTaskInput>();
  readonly updated = output<UpdateTaskInput>();
  readonly cancelled = output<void>();

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly priorityOptions = PRIORITY_OPTIONS;
  protected readonly initial = computed(() => toValues(this.task(), this.defaultPhaseId()));
  protected readonly values = linkedSignal(() => this.initial());
  protected readonly editing = computed(() => this.task() !== null);

  readonly #attempted = signal(false);
  readonly #incompleteDates = signal<readonly FieldName[]>([]);
  readonly #blockedSubmits = signal(0);

  /** Un error del backend se va en cuanto la persona toca su campo. */
  readonly #serverErrors = linkedSignal<Record<string, string>>(() => {
    const failure = this.failure();

    return failure?.kind === 'fields' ? failure.fields : {};
  });

  readonly #clientErrors = computed(() => {
    const { title, phaseId, startDate, dueDate } = this.values();
    const errors: FieldMessages = {};

    if (title.trim() === '') {
      errors.title = 'El título es obligatorio.';
    }

    if (phaseId === '') {
      errors.phaseId = 'Elige la fase de la tarea.';
    }

    if (startDate && dueDate && startDate > dueDate) {
      errors.dueDate = 'La fecha límite no puede ser anterior a la de inicio';
    }

    for (const field of this.#incompleteDates()) {
      errors[field] = INCOMPLETE_DATE;
    }

    return errors;
  });

  /** Solo lo que cambió. Un campo vaciado va como `null`. */
  readonly #changes = computed(() => {
    const values = this.values();
    const initial = this.initial();
    const changes: UpdateTaskInput = {};

    if (values.phaseId !== initial.phaseId) {
      changes.phaseId = values.phaseId;
    }

    if (values.title.trim() !== initial.title.trim()) {
      changes.title = values.title.trim();
    }

    if (values.description.trim() !== initial.description.trim()) {
      changes.description = values.description.trim() || null;
    }

    if (values.status !== initial.status) {
      changes.status = values.status;
    }

    if (values.priority !== initial.priority) {
      changes.priority = values.priority;
    }

    if (values.assigneeId !== initial.assigneeId) {
      changes.assigneeId = values.assigneeId || null;
    }

    if (values.startDate !== initial.startDate) {
      changes.startDate = values.startDate || null;
    }

    if (values.dueDate !== initial.dueDate) {
      changes.dueDate = values.dueDate || null;
    }

    return changes;
  });

  protected readonly canSubmit = computed(
    () => !this.busy() && (!this.editing() || Object.keys(this.#changes()).length > 0),
  );

  protected readonly submitLabel = computed(() => {
    if (this.editing()) {
      return this.busy() ? 'Guardando cambios…' : 'Guardar cambios';
    }

    return this.busy() ? 'Creando tarea…' : 'Crear tarea';
  });

  /** Lo que no tiene campo donde pintarse. */
  protected readonly notice = computed(() => {
    const failure = this.failure();

    if (failure?.kind === 'message') {
      return failure;
    }

    return failure?.kind === 'fields' &&
      !Object.keys(failure.fields).some((field) => field in this.values())
      ? failure
      : null;
  });

  constructor() {
    afterNextRender(() => this.#host.nativeElement.querySelector('input')?.focus());

    afterRenderEffect(() => {
      this.#blockedSubmits();
      this.failure();
      this.#host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }

  protected error(field: FieldName): string | null {
    const clientError = this.#attempted() ? this.#clientErrors()[field] : undefined;

    return clientError ?? this.#serverErrors()[field] ?? null;
  }

  protected describedBy(field: FieldName, id: string): string | null {
    return this.error(field) === null ? null : `${id}-error`;
  }

  protected update(field: FieldName, event: Event): void {
    const { value } = event.target as HTMLInputElement;

    this.values.update((values) => ({ ...values, [field]: value }));
    this.#serverErrors.update(({ [field]: _, ...others }) => others);
    this.#incompleteDates.update((fields) => fields.filter((name) => name !== field));
  }

  protected submit(event: Event): void {
    event.preventDefault();

    if (!this.canSubmit()) {
      return;
    }

    // Una fecha a medias informa `value` vacío, igual que una borrada, y vaciaría el campo.
    const dates = (event.target as HTMLFormElement).querySelectorAll('input[type=date]');

    this.#incompleteDates.set(
      Array.from(dates as NodeListOf<HTMLInputElement>)
        .filter((element) => element.validity.badInput)
        .map((element) => element.name as FieldName),
    );
    this.#attempted.set(true);

    if (Object.keys(this.#clientErrors()).length > 0) {
      this.#blockedSubmits.update((count) => count + 1);
      return;
    }

    if (this.editing()) {
      this.updated.emit(this.#changes());
      return;
    }

    const { phaseId, title, description, status, priority, assigneeId, startDate, dueDate } =
      this.values();

    this.created.emit({
      phaseId,
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      assigneeId: assigneeId || undefined,
      startDate: startDate || undefined,
      dueDate: dueDate || undefined,
    });
  }
}
