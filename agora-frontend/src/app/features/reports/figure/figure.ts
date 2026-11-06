import { Component, input } from '@angular/core';

/** Una cifra con su nombre y, si hace falta, lo que la explica. Sin gráfico: el número basta. */
@Component({
  selector: 'app-figure',
  template: `
    <p class="etiqueta text-tinta">{{ label() }}</p>
    <p class="titulo-pagina text-tinta tabular-nums">{{ value() }}</p>
    @if (detail(); as detail) {
      <p class="secundario text-tinta-media">{{ detail }}</p>
    }
  `,
  host: {
    class:
      'grid content-start gap-espacio-1 bg-superficie-00 rounded-radio-md p-espacio-4 shadow-sombra-tarjeta',
  },
})
export class Figure {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly detail = input<string>();
}
