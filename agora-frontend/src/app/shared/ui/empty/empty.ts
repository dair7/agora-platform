import { Component, input } from '@angular/core';

/**
 * Del componente Estado vacío del sistema de diseño: lo que se ve cuando no hay
 * nada que mostrar. No es un error, así que ni `arrecife` ni `app-notice`.
 *
 * Dice qué falta y, si se puede, ofrece la acción que lo resuelve, proyectada con
 * `[emptyAction]`.
 *
 * No trae ningún texto por defecto, y es a propósito: «todavía no hay proyectos»
 * va con una acción de crear, y «ningún proyecto coincide con la búsqueda» con una
 * de limpiar el filtro. El componente no puede saber en cuál de los dos está, y un
 * texto por defecto garantiza que alguna pantalla muestre el equivocado.
 */
@Component({
  selector: 'app-empty',
  template: `
    <p class="titulo-tarjeta text-tinta">{{ title() }}</p>
    @if (description()) {
      <p class="secundario text-tinta-media mt-espacio-1">{{ description() }}</p>
    }
    <div class="mt-espacio-4 empty:hidden"><ng-content select="[emptyAction]" /></div>
  `,
  host: {
    class: 'block bg-superficie-00 border border-borde rounded-radio-md p-espacio-5 text-center',
  },
})
export class Empty {
  readonly title = input.required<string>();
  readonly description = input<string>();
}
