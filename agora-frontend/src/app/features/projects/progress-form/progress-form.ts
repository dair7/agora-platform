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
import type {
  CreateProgressInput,
  ProgressEntry,
  UpdateProgressInput,
} from '../../../core/api/progress.types';
import { Button } from '../../../shared/ui/button/button';
import { Field, FieldSelect, FieldTextarea } from '../../../shared/ui/field/field';
import { Notice } from '../../../shared/ui/notice/notice';

export interface TaskOption {
  id: string;
  title: string;
}

interface ProgressFormValues {
  description: string;
  taskId: string;
}

/**
 * Registrar o editar un avance. Como los de fase y tarea, no llama a la API, ata los
 * campos al valor inicial y recibe una foto del avance: si fuera la de la lista, un evento
 * que la recargue reescribiría lo que la persona está escribiendo.
 */
@Component({
  selector: 'app-progress-form',
  imports: [Button, Field, FieldSelect, FieldTextarea, Notice],
  templateUrl: './progress-form.html',
  host: { class: 'block' },
})
export class ProgressForm {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** `null` para registrar uno nuevo. */
  readonly entry = input<ProgressEntry | null>(null);
  readonly tasks = input<readonly TaskOption[]>([]);
  readonly busy = input(false);
  readonly failure = input<ApiErrorOutcome | null>(null);

  readonly created = output<CreateProgressInput>();
  readonly updated = output<UpdateProgressInput>();
  readonly cancelled = output<void>();

  protected readonly editing = computed(() => this.entry() !== null);
  protected readonly initial = computed<ProgressFormValues>(() => ({
    description: this.entry()?.description ?? '',
    taskId: this.entry()?.taskId ?? '',
  }));
  protected readonly values = linkedSignal(() => this.initial());

  readonly #attempted = signal(false);
  readonly #blockedSubmits = signal(0);

  /** Un error del backend se va en cuanto la persona toca su campo. */
  readonly #serverErrors = linkedSignal<Record<string, string>>(() => {
    const failure = this.failure();

    return failure?.kind === 'fields' ? failure.fields : {};
  });

  /** Solo lo que cambió. Soltar la tarea va como `null`. */
  readonly #changes = computed(() => {
    const values = this.values();
    const initial = this.initial();
    const changes: UpdateProgressInput = {};

    if (values.description.trim() !== initial.description.trim()) {
      changes.description = values.description.trim();
    }

    if (values.taskId !== initial.taskId) {
      changes.taskId = values.taskId || null;
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

    return this.busy() ? 'Registrando avance…' : 'Registrar avance';
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
    afterNextRender(() => this.#host.nativeElement.querySelector('textarea')?.focus());

    afterRenderEffect(() => {
      this.#blockedSubmits();
      this.failure();
      this.#host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }

  protected error(field: keyof ProgressFormValues): string | null {
    const empty = this.#attempted() && this.values().description.trim() === '';

    if (field === 'description' && empty) {
      return 'Escribe qué avanzó.';
    }

    return this.#serverErrors()[field] ?? null;
  }

  protected update(field: keyof ProgressFormValues, event: Event): void {
    const { value } = event.target as HTMLInputElement;

    this.values.update((values) => ({ ...values, [field]: value }));
    this.#serverErrors.update(({ [field]: _, ...others }) => others);
  }

  protected submit(event: Event): void {
    event.preventDefault();

    if (!this.canSubmit()) {
      return;
    }

    this.#attempted.set(true);

    const { description, taskId } = this.values();

    if (description.trim() === '') {
      this.#blockedSubmits.update((count) => count + 1);
      return;
    }

    if (this.editing()) {
      this.updated.emit(this.#changes());
      return;
    }

    this.created.emit({ description: description.trim(), taskId: taskId || undefined });
  }
}
