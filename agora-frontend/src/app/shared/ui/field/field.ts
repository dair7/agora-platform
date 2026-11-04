import { Component, Directive, HostAttributeToken, computed, inject, input } from '@angular/core';

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

/**
 * El aspecto del control dentro de un Campo: una superficie blanca apoyada sobre
 * el fondo, sin borde propio. El hairline lo pone `sombra-campo`.
 *
 * Con `invalid`, el contorno pasa a `arrecife` con un anillo, no con un borde:
 * el anillo se suma a la sombra en vez de sustituirla, y no mueve el campo.
 *
 * Es la base de las tres directivas de abajo: el aspecto, `aria-invalid` y
 * `aria-describedby` viven aquí, y cada una solo dice sobre qué elemento se pone
 * y qué le añade.
 */
@Directive({
  host: {
    '[class]': 'classes()',
    '[attr.aria-invalid]': 'invalid() || null',
    '[attr.aria-describedby]': 'describedBy()',
  },
})
abstract class FieldControl {
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);

  protected readonly extraClasses: string = '';

  protected readonly classes = computed(
    () =>
      'cuerpo w-full text-tinta bg-superficie-00 p-espacio-3 rounded-radio-sm ' +
      'shadow-sombra-campo placeholder:text-tinta-tenue ' +
      this.extraClasses +
      (this.invalid() ? ' ring-1 ring-arrecife' : ''),
  );
}

/** El campo de una línea. */
@Directive({ selector: 'input[appInput]' })
export class FieldInput extends FieldControl {}

/** Hasta dónde crece un área de texto: a partir de ahí, scroll interno. */
const TEXTAREA_MAX_ROWS = 10;

/** Border-box: el alto de `rows` líneas más el relleno `espacio-3` de arriba y de abajo. */
const textareaHeight = (rows: number): string => `calc(${rows}lh + 2 * var(--espacio-3))`;

/**
 * Para texto largo. El manejo a mano crece solo en vertical: a lo ancho rompería
 * la columna.
 *
 * Crece con su contenido por `field-sizing: content`, como mejora progresiva. Esa
 * propiedad hace que el navegador ignore `rows`, así que el suelo se vuelve a poner
 * con `min-height`, leyendo el `rows` de la plantilla. Va en línea porque depende
 * de ese atributo. El techo solo se aplica si la propiedad existe: sin ella el campo
 * se queda como siempre, con su scroll interno y su tirador sin límite.
 */
@Directive({
  selector: 'textarea[appTextarea]',
  host: {
    '[style.min-height]': 'minHeight',
    '[style.max-height]': 'maxHeight',
  },
})
export class FieldTextarea extends FieldControl {
  protected override readonly extraClasses =
    'resize-y field-sizing-content disabled:cursor-not-allowed disabled:opacity-opacidad-deshabilitado';

  protected readonly minHeight = textareaHeight(
    Number(inject(new HostAttributeToken('rows'), { optional: true }) ?? 2),
  );
  protected readonly maxHeight = CSS.supports('field-sizing', 'content')
    ? textareaHeight(TEXTAREA_MAX_ROWS)
    : null;
}

/**
 * El desplegable, sobre el `<select>` nativo: el teclado, el selector del móvil y
 * la accesibilidad vienen hechos. La flecha es la del sistema operativo, a propósito.
 */
@Directive({ selector: 'select[appSelect]' })
export class FieldSelect extends FieldControl {
  protected override readonly extraClasses =
    'cursor-pointer disabled:cursor-not-allowed disabled:opacity-opacidad-deshabilitado';
}
