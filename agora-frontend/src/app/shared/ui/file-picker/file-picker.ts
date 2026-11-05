import { Component, computed, input, output } from '@angular/core';
import { formatFileSize } from '../../../core/format/file-size';
import { Button } from '../button/button';

/**
 * Elegir un archivo. El `<input type="file">` nativo no se puede vestir con los tokens,
 * así que va escondido y lo abre un botón de verdad: el teclado, el foco y el anillo son
 * los del botón, sin reimplementar nada. Va dentro de un `app-field`, cuyo `for` es
 * `controlId`, y por fuera se ve como un campo más: superficie blanca con `sombra-campo`.
 *
 * No guarda el archivo: lo emite y quien lo usa decide si lo acepta, y se lo devuelve por
 * `file`. El `value` del input se vacía cada vez, o elegir de nuevo el mismo archivo no
 * dispararía `change`.
 */
@Component({
  selector: 'app-file-picker',
  imports: [Button],
  template: `
    <input #input class="hidden" type="file" tabindex="-1" (change)="pick(input)" />
    <button
      appButton
      variant="secondary"
      type="button"
      class="shrink-0"
      [id]="controlId()"
      [disabled]="disabled()"
      [attr.aria-invalid]="invalid() || null"
      [attr.aria-describedby]="description()"
      (click)="input.click()"
    >
      {{ file() ? 'Cambiar archivo' : 'Elegir archivo' }}
    </button>
    @if (file(); as chosen) {
      <p class="secundario text-tinta wrap-anywhere" [id]="statusId()">
        {{ chosen.name }} · <span class="tabular-nums">{{ size() }}</span>
      </p>
    } @else {
      <p class="secundario text-tinta-media" [id]="statusId()">Ningún archivo elegido</p>
    }
  `,
  host: { '[class]': 'classes()' },
})
export class FilePicker {
  readonly controlId = input.required<string>();
  readonly file = input<File | null>(null);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);

  readonly selected = output<File>();

  protected readonly statusId = computed(() => `${this.controlId()}-archivo`);
  protected readonly size = computed(() => formatFileSize(this.file()?.size ?? 0));

  /** El archivo elegido, y el error o la ayuda del campo. */
  protected readonly description = computed(() =>
    [this.statusId(), this.describedBy()].filter(Boolean).join(' '),
  );

  protected readonly classes = computed(
    () =>
      'flex flex-wrap items-center gap-x-espacio-3 gap-y-espacio-2 bg-superficie-00 p-espacio-3 ' +
      'rounded-radio-sm shadow-sombra-campo' +
      (this.invalid() ? ' ring-1 ring-arrecife' : ''),
  );

  protected pick(element: HTMLInputElement): void {
    const file = element.files?.[0];

    element.value = '';

    if (file) {
      this.selected.emit(file);
    }
  }
}
