import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import type { ApiErrorOutcome } from '../../../core/api/api-error';
import { MAX_UPLOAD_MEGABYTES, uploadProblem } from '../../../core/api/document-files';
import type { ProjectDocument } from '../../../core/api/documents.types';
import { Button } from '../../../shared/ui/button/button';
import { Field, FieldSelect } from '../../../shared/ui/field/field';
import { FilePicker } from '../../../shared/ui/file-picker/file-picker';
import { Notice } from '../../../shared/ui/notice/notice';
import type { TaskOption } from '../progress-form/progress-form';

export interface DocumentUploadRequest {
  file: File;
  taskId?: string;
}

/**
 * Subir un documento o una versión nueva. No llama a la API: emite el archivo, solo si
 * pasa las reglas que ya se saben de antemano. Un archivo de más de 20 MB no llega a
 * elegirse, y por tanto no sale.
 *
 * `fetch` no informa del progreso de una subida, así que no hay porcentaje. Para que no
 * parezca colgado se dice qué se está subiendo y cuánto lleva, y el contador cambia cada
 * segundo sin agregar ningún movimiento continuo a la pantalla. No se anuncia cada
 * segundo al lector de pantalla: solo que empezó.
 */
@Component({
  selector: 'app-document-upload',
  imports: [Button, Field, FieldSelect, FilePicker, Notice],
  templateUrl: './document-upload.html',
  host: { class: 'block' },
})
export class DocumentUpload {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** La versión sobre la que se sube, o `null` para un documento nuevo. */
  readonly target = input<ProjectDocument | null>(null);
  readonly tasks = input<readonly TaskOption[]>([]);
  readonly busy = input(false);
  readonly failure = input<ApiErrorOutcome | null>(null);

  readonly submitted = output<DocumentUploadRequest>();
  readonly cancelled = output<void>();

  protected readonly hint = `Hasta ${MAX_UPLOAD_MEGABYTES} MB.`;
  protected readonly file = signal<File | null>(null);
  protected readonly taskId = signal('');
  protected readonly elapsed = signal(0);

  /** Lo que se rechazó al elegir, o lo que respondió el backend sobre el archivo. */
  protected readonly fileError = linkedSignal<string | null>(() => {
    const failure = this.failure();

    return failure?.kind === 'fields' ? (failure.fields['file'] ?? null) : null;
  });

  protected readonly canSubmit = computed(() => !this.busy() && this.file() !== null);

  protected readonly title = computed(() => {
    const target = this.target();

    return target ? `Versión nueva de ${target.name}` : 'Subir documento';
  });

  protected readonly submitLabel = computed(() => {
    if (this.busy()) {
      return 'Subiendo…';
    }

    return this.target() ? 'Subir versión' : 'Subir documento';
  });

  /** Lo que no tiene campo donde pintarse. */
  protected readonly notice = computed(() => {
    const failure = this.failure();

    if (failure?.kind === 'message') {
      return failure;
    }

    return failure?.kind === 'fields' && !('file' in failure.fields) ? failure : null;
  });

  constructor() {
    afterNextRender(() => this.#host.nativeElement.querySelector('button')?.focus());

    let timer: ReturnType<typeof setInterval> | undefined;

    effect(() => {
      clearInterval(timer);

      if (this.busy()) {
        this.elapsed.set(0);
        timer = setInterval(() => this.elapsed.update((seconds) => seconds + 1), 1000);
      }
    });

    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected choose(file: File): void {
    const problem = uploadProblem(file);

    this.file.set(problem ? null : file);
    this.fileError.set(problem);
  }

  protected submit(event: Event): void {
    event.preventDefault();

    const file = this.file();

    if (file && this.canSubmit()) {
      this.submitted.emit({ file, taskId: this.taskId() || undefined });
    }
  }
}
