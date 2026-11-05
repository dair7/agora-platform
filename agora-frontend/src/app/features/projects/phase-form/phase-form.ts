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
  CreatePhaseInput,
  Phase,
  PhaseStatus,
  UpdatePhaseInput,
} from '../../../core/api/phases.types';
import { Button } from '../../../shared/ui/button/button';
import { Field, FieldInput, FieldSelect, FieldTextarea } from '../../../shared/ui/field/field';
import { Notice } from '../../../shared/ui/notice/notice';
import { workStatusLabel } from '../../../shared/ui/work-status/work-status';

interface PhaseFormValues {
  name: string;
  description: string;
  status: PhaseStatus;
  startDate: string;
  endDate: string;
}

type FieldName = keyof PhaseFormValues;
type FieldMessages = Partial<Record<FieldName, string>>;

const toValues = (phase: Phase | null): PhaseFormValues => ({
  name: phase?.name ?? '',
  description: phase?.description ?? '',
  status: phase?.status ?? 'PENDING',
  // Como texto, sin pasar por un `Date`: llegan a medianoche UTC.
  startDate: phase?.startDate?.slice(0, 10) ?? '',
  endDate: phase?.endDate?.slice(0, 10) ?? '',
});

const STATUS_OPTIONS = (['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const).map((value) => ({
  value,
  label: workStatusLabel(value),
}));

const INCOMPLETE_DATE = 'La fecha está incompleta. Complétala o bórrala.';

/**
 * Crear o editar una fase. No llama a la API: emite lo que hay que enviar. Como el de
 * proyecto, ata los campos al valor inicial y no al actual, y quien lo usa le pasa una
 * foto de la fase: si fuera la de la lista, un evento que la recargue reescribiría lo que
 * la persona está tecleando.
 */
@Component({
  selector: 'app-phase-form',
  imports: [Button, Field, FieldInput, FieldSelect, FieldTextarea, Notice],
  templateUrl: './phase-form.html',
  host: { class: 'block' },
})
export class PhaseForm {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** `null` para crear. */
  readonly phase = input<Phase | null>(null);
  readonly busy = input(false);
  readonly failure = input<ApiErrorOutcome | null>(null);

  readonly created = output<CreatePhaseInput>();
  readonly updated = output<UpdatePhaseInput>();
  readonly cancelled = output<void>();

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly initial = computed(() => toValues(this.phase()));
  protected readonly values = linkedSignal(() => this.initial());
  protected readonly editing = computed(() => this.phase() !== null);

  readonly #attempted = signal(false);
  readonly #incompleteDates = signal<readonly FieldName[]>([]);
  readonly #blockedSubmits = signal(0);

  /** Un error del backend se va en cuanto la persona toca su campo. */
  readonly #serverErrors = linkedSignal<Record<string, string>>(() => {
    const failure = this.failure();

    return failure?.kind === 'fields' ? failure.fields : {};
  });

  readonly #clientErrors = computed(() => {
    const { name, startDate, endDate } = this.values();
    const errors: FieldMessages = {};

    if (name.trim() === '') {
      errors.name = 'El nombre es obligatorio.';
    }

    if (startDate && endDate && startDate > endDate) {
      errors.endDate = 'La fecha de fin no puede ser anterior a la de inicio';
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
    const changes: UpdatePhaseInput = {};

    if (values.name.trim() !== initial.name.trim()) {
      changes.name = values.name.trim();
    }

    if (values.description.trim() !== initial.description.trim()) {
      changes.description = values.description.trim() || null;
    }

    if (values.status !== initial.status) {
      changes.status = values.status;
    }

    if (values.startDate !== initial.startDate) {
      changes.startDate = values.startDate || null;
    }

    if (values.endDate !== initial.endDate) {
      changes.endDate = values.endDate || null;
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

    return this.busy() ? 'Creando fase…' : 'Crear fase';
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

    const { name, description, status, startDate, endDate } = this.values();

    this.created.emit({
      name: name.trim(),
      description: description.trim() || undefined,
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  }
}
