import {
  Component,
  ElementRef,
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
  CreateProjectInput,
  Project,
  UpdatableProjectStatus,
  UpdateProjectInput,
} from '../../../core/api/projects.types';
import type { UserSummary } from '../../../core/api/users.types';
import { Button } from '../../../shared/ui/button/button';
import { Field, FieldInput, FieldSelect, FieldTextarea } from '../../../shared/ui/field/field';
import { Notice, type NoticeTone } from '../../../shared/ui/notice/notice';
import { projectStatusLabel } from '../../../shared/ui/project-status/project-status';

export type ProjectFormMode = 'create' | 'edit';

/** Lo que hay en los campos, siempre como texto: lo que da y toma el DOM. */
export interface ProjectFormValues {
  title: string;
  principalInvestigatorId: string;
  status: UpdatableProjectStatus;
  description: string;
  objectives: string;
  /** `YYYY-MM-DD`, lo que da y toma un `<input type="date">`. */
  startDate: string;
  endDate: string;
  budget: string;
}

type FieldName = keyof ProjectFormValues;
type FieldMessages = Partial<Record<FieldName, string>>;

const EMPTY_VALUES: ProjectFormValues = {
  title: '',
  principalInvestigatorId: '',
  status: 'PLANNING',
  description: '',
  objectives: '',
  startDate: '',
  endDate: '',
  budget: '',
};

/**
 * Las fechas se recortan como texto y no pasan por un `Date`: llegan a medianoche
 * UTC y, leídas en la hora de Colombia, se correrían un día.
 *
 * El estado se afirma porque la pantalla de editar nunca monta el formulario con
 * un proyecto `COMPLETED`.
 */
export const toFormValues = (project: Project): ProjectFormValues => ({
  ...EMPTY_VALUES,
  title: project.title,
  status: project.status as UpdatableProjectStatus,
  description: project.description ?? '',
  objectives: project.objectives ?? '',
  startDate: project.startDate?.slice(0, 10) ?? '',
  endDate: project.endDate?.slice(0, 10) ?? '',
  budget: project.budget ?? '',
});

/** Sin `COMPLETED`: el backend lo rechaza, y cerrar tiene su botón y su confirmación. */
const STATUS_OPTIONS = (['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'] as const).map(
  (value) => ({ value, label: projectStatusLabel(value) }),
);

/** Los campos que se pintan en cada modo, para saber si un error del backend tiene dónde ir. */
const FIELDS: Record<ProjectFormMode, readonly string[]> = {
  create: [
    'title',
    'principalInvestigatorId',
    'description',
    'objectives',
    'startDate',
    'endDate',
    'budget',
  ],
  edit: ['title', 'status', 'description', 'objectives', 'startDate', 'endDate', 'budget'],
};

const HINTS: FieldMessages = {
  title: 'Entre 3 y 200 caracteres.',
  budget: 'En pesos colombianos, solo números.',
};

/**
 * Lo que el contrato no deja vaciar. Descripción y objetivos no están: se vacían
 * mandando cadena vacía, que el backend acepta y el detalle trata como ausente.
 */
const KEPT_ON_CLEAR: FieldMessages = {
  startDate: 'Por ahora la fecha no se puede quitar. Se conservará la actual.',
  endDate: 'Por ahora la fecha no se puede quitar. Se conservará la actual.',
  budget: 'Por ahora el presupuesto no se puede quitar. Se conservará el actual.',
};

/** Una fecha a medias informa `value` vacío: sin esto, lo tecleado se perdería sin avisar. */
const INCOMPLETE_DATE = 'La fecha está incompleta. Complétala o bórrala.';

/** Un salto, con los espacios que lo rodean, pasa a ser un espacio. */
const toSingleLine = (text: string): string => text.replace(/\s*\n\s*/g, ' ');

const END_BEFORE_START = 'La fecha de fin no puede ser anterior a la de inicio';

/**
 * El formulario de proyecto, para crear y para editar. No llama a la API ni
 * navega: recibe los valores iniciales y el modo, y emite lo que hay que enviar.
 * El resultado de enviarlo vuelve por `busy` y `failure`.
 *
 * **Los campos no se atan a su valor actual, sino al inicial.** Escribir en ellos
 * desde una señal borraría una fecha a medio teclear: un `<input type="date">`
 * con un segmento vacío informa `value` vacío, y devolverle ese vacío limpia
 * también los segmentos que sí tenían dato.
 */
@Component({
  selector: 'app-project-form',
  imports: [Button, Field, FieldInput, FieldSelect, FieldTextarea, Notice],
  templateUrl: './project-form.html',
  host: { class: 'block max-w-ancho-formulario' },
})
export class ProjectForm {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly mode = input.required<ProjectFormMode>();
  readonly initial = input(EMPTY_VALUES);
  /** Mientras se envía: deshabilita los botones. */
  readonly busy = input(false);
  /** El último fallo al enviar, ya traducido por `apiErrorOutcome`. */
  readonly failure = input<ApiErrorOutcome | null>(null);

  // Las personas del desplegable de investigador principal, solo al crear.
  readonly leads = input<readonly UserSummary[]>([]);
  readonly leadsLoading = input(false);
  readonly leadsError = input<string | null>(null);

  readonly created = output<CreateProjectInput>();
  readonly updated = output<UpdateProjectInput>();
  readonly cancelled = output<void>();
  readonly retryLeads = output<void>();

  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly values = linkedSignal(() => this.initial());
  /** Los errores del cliente se muestran desde el primer intento de enviar. */
  readonly #attempted = signal(false);
  readonly #incompleteDates = signal<readonly FieldName[]>([]);
  /** Sube con cada envío detenido en el cliente, para llevar el foco al error. */
  readonly #blockedSubmits = signal(0);

  /** Un error del backend se va en cuanto la persona toca su campo. */
  readonly #serverErrors = linkedSignal<Record<string, string>>(() => {
    const failure = this.failure();

    return failure?.kind === 'fields' ? failure.fields : {};
  });

  /** Lo que el cliente ya sabe. El backend sigue siendo la autoridad. */
  readonly #clientErrors = computed(() => {
    const values = this.values();
    const errors: FieldMessages = {};

    if (values.title.trim() === '') {
      errors.title = 'El título es obligatorio.';
    }

    if (this.mode() === 'create' && values.principalInvestigatorId === '') {
      errors.principalInvestigatorId = 'Elige quién dirige el proyecto.';
    }

    // Sobre el resultado y no sobre lo escrito: una fecha borrada se conserva, y así
    // lo valida el backend. Entre fechas `YYYY-MM-DD` el orden del texto es el del
    // calendario; el `max` de los campos asegura los cuatro dígitos del año.
    const start = values.startDate || this.initial().startDate;
    const end = values.endDate || this.initial().endDate;

    if (start && end && start > end) {
      errors.endDate = values.endDate
        ? END_BEFORE_START
        : 'La fecha de fin que se conserva es anterior a la de inicio.';
    }

    for (const field of this.#incompleteDates()) {
      errors[field] = INCOMPLETE_DATE;
    }

    // Lo guardado no se juzga: por la API pueden haber entrado decimales.
    const budget = values.budget.trim();

    if (budget !== '' && budget !== this.initial().budget && !/^\d+$/.test(budget)) {
      errors.budget = 'Escribe el presupuesto solo con números, sin puntos ni comas.';
    }

    return errors;
  });

  /** En edición, solo lo que cambió. Lo que no se puede vaciar no se envía. */
  readonly #changes = computed(() => {
    const values = this.values();
    const initial = this.initial();
    const changes: UpdateProjectInput = {};

    if (values.title.trim() !== initial.title.trim()) {
      changes.title = values.title.trim();
    }

    if (values.status !== initial.status) {
      changes.status = values.status;
    }

    if (values.description.trim() !== initial.description.trim()) {
      changes.description = values.description.trim();
    }

    if (values.objectives.trim() !== initial.objectives.trim()) {
      changes.objectives = values.objectives.trim();
    }

    if (values.startDate !== '' && values.startDate !== initial.startDate) {
      changes.startDate = values.startDate;
    }

    if (values.endDate !== '' && values.endDate !== initial.endDate) {
      changes.endDate = values.endDate;
    }

    const budget = values.budget.trim();

    if (budget !== '' && budget !== initial.budget) {
      changes.budget = Number(budget);
    }

    return changes;
  });

  /**
   * Al editar, el backend exige al menos un campo. Al crear, sin la lista de
   * personas no hay investigador principal, y sin él no hay proyecto.
   */
  protected readonly canSubmit = computed(() => {
    if (this.busy()) {
      return false;
    }

    return this.mode() === 'edit'
      ? Object.keys(this.#changes()).length > 0
      : !this.leadsLoading() && this.leadsError() === null;
  });

  protected readonly submitLabel = computed(() => {
    if (this.mode() === 'create') {
      return this.busy() ? 'Creando proyecto…' : 'Crear proyecto';
    }

    return this.busy() ? 'Guardando cambios…' : 'Guardar cambios';
  });

  protected readonly leadPlaceholder = computed(() => {
    if (this.leadsLoading()) {
      return 'Cargando personas…';
    }

    if (this.leadsError() !== null) {
      return 'No se pudieron cargar';
    }

    return this.leads().length === 0 ? 'No hay cuentas de investigación' : 'Elige a una persona';
  });

  /** Lo que no tiene campo donde pintarse. */
  protected readonly notice = computed<{ message: string; tone: NoticeTone } | null>(() => {
    const failure = this.failure();

    if (failure?.kind === 'message') {
      return { message: failure.message, tone: failure.code === 'CONFLICT' ? 'block' : 'error' };
    }

    if (failure?.kind === 'fields') {
      const placed = Object.keys(failure.fields).some((field) =>
        FIELDS[this.mode()].includes(field),
      );

      return placed ? null : { message: failure.message, tone: 'error' };
    }

    return null;
  });

  constructor() {
    // En un formulario largo el error puede quedar fuera de la pantalla, sobre todo
    // en móvil, donde el botón de enviar está muy por debajo del título.
    afterRenderEffect(() => {
      this.#blockedSubmits();
      this.failure();
      this.#host.nativeElement.querySelector<HTMLElement>('[aria-invalid]')?.focus();
    });
  }

  protected error(field: FieldName): string | null {
    const clientError = this.#attempted() ? this.#clientErrors()[field] : undefined;

    return clientError ?? this.#serverErrors()[field] ?? null;
  }

  protected hint(field: FieldName): string | undefined {
    const cleared = this.values()[field] === '' && this.initial()[field] !== '';

    return (cleared ? KEPT_ON_CLEAR[field] : undefined) ?? HINTS[field];
  }

  /** El `id` de lo que `app-field` pinta debajo: el error tiene prioridad sobre la ayuda. */
  protected describedBy(field: FieldName, id: string): string | null {
    if (this.error(field) !== null) {
      return `${id}-error`;
    }

    return this.hint(field) ? `${id}-hint` : null;
  }

  protected update(field: FieldName, event: Event): void {
    const { value } = event.target as HTMLInputElement;

    this.values.update((values) => ({ ...values, [field]: value }));
    this.#serverErrors.update(({ [field]: _, ...others }) => others);
    this.#incompleteDates.update((fields) => fields.filter((name) => name !== field));
  }

  /**
   * El título es de una línea aunque se escriba en un área de texto. Enter envía,
   * como en cualquier campo de título. Se ataja en `beforeinput` y no en `keydown`
   * porque aquí llega también Shift+Enter, y una tecla Enter que confirma una
   * composición no llega.
   */
  protected submitOnLineBreak(event: InputEvent): void {
    if (event.inputType === 'insertLineBreak') {
      event.preventDefault();
      (event.target as HTMLTextAreaElement).form?.requestSubmit();
    }
  }

  /**
   * Lo pegado sí puede traer saltos. Se quitan en el campo y no solo al enviar: lo
   * que la persona ve es lo que se guarda.
   */
  protected updateTitle(event: Event): void {
    const field = event.target as HTMLTextAreaElement;

    if (field.value.includes('\n')) {
      const caret = toSingleLine(field.value.slice(0, field.selectionStart)).length;

      field.value = toSingleLine(field.value);
      field.setSelectionRange(caret, caret);
    }

    this.update('title', event);
  }

  protected submit(event: Event): void {
    event.preventDefault();

    // No sobra: Enter en el título llama a `requestSubmit()`, que no mira si el botón
    // de envío está deshabilitado.
    if (!this.canSubmit()) {
      return;
    }

    // `badInput` se lee aquí y no al teclear: una fecha a medias no dispara `input`
    // mientras su `value` siga vacío.
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

    if (this.mode() === 'edit') {
      this.updated.emit(this.#changes());
    } else {
      this.created.emit(this.#createInput());
    }
  }

  /** Lo opcional que quedó vacío no se envía: el proyecto nace con `null`, no con `""`. */
  #createInput(): CreateProjectInput {
    const values = this.values();

    return {
      title: values.title.trim(),
      principalInvestigatorId: values.principalInvestigatorId,
      description: values.description.trim() || undefined,
      objectives: values.objectives.trim() || undefined,
      startDate: values.startDate || undefined,
      endDate: values.endDate || undefined,
      budget: values.budget.trim() === '' ? undefined : Number(values.budget),
    };
  }
}
