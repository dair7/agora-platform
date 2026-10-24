import { Component, Directive, computed, input } from '@angular/core';

/**
 * Del componente Campo del sistema de diseño. La etiqueta va siempre visible,
 * encima: el marcador de posición no sirve de etiqueta porque desaparece al
 * escribir. El error vive debajo del campo que lo causó, nunca en un aviso aparte.
 *
 * El control se proyecta dentro; `for` es su `id`, y de él salen los `id` del
 * error y de la ayuda que el control anuncia con `describedBy`.
 */
@Component({
  selector: 'app-field',
  template: `
    <label class="etiqueta text-tinta" [for]="for()">{{ label() }}</label>
    <ng-content />
    @if (error()) {
      <p class="secundario text-arrecife" [id]="for() + '-error'">{{ error() }}</p>
    } @else if (hint()) {
      <p class="secundario text-tinta-media" [id]="for() + '-hint'">{{ hint() }}</p>
    }
  `,
  host: { class: 'grid gap-espacio-1' },
})
export class Field {
  readonly for = input.required<string>();
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string | null | undefined>();
}

/** El aspecto del control dentro de un Campo. Con `invalid`, el borde pasa a `arrecife`. */
@Directive({
  selector: 'input[appInput]',
  host: {
    '[class]': 'classes()',
    '[attr.aria-invalid]': 'invalid() || null',
    '[attr.aria-describedby]': 'describedBy()',
  },
})
export class FieldInput {
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);

  protected readonly classes = computed(
    () =>
      'cuerpo w-full text-tinta bg-superficie-00 p-espacio-3 border rounded-radio-sm ' +
      'placeholder:text-tinta-tenue ' +
      (this.invalid() ? 'border-arrecife' : 'border-borde-fuerte'),
  );
}
