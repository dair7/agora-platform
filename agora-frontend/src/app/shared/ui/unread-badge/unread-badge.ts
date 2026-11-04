import { Component, input } from '@angular/core';

/**
 * El contador de mensajes sin leer, del componente TarjetaProyecto del sistema. Un
 * cero no se dibuja: quien lo usa no lo pinta si no hay ninguno.
 */
@Component({
  selector: 'app-unread-badge',
  template: `
    <span aria-hidden="true">{{ count() }}</span>
    <span class="sr-only">{{
      count() === 1 ? '1 mensaje sin leer' : count() + ' mensajes sin leer'
    }}</span>
  `,
  styleUrl: './unread-badge.css',
  host: {
    class: 'sin-leer inline-block bg-veril text-tinta-inversa rounded-radio-sm tabular-nums',
  },
})
export class UnreadBadge {
  readonly count = input.required<number>();
}
