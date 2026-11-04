import { Component, input } from '@angular/core';

/**
 * El punto de presencia. Late: es el único movimiento continuo del sistema, y por
 * eso vive en un solo sitio. Lo que late es el punto, nunca el texto que lo acompaña.
 */
@Component({
  selector: 'app-presence-dot',
  template: '',
  styleUrl: './presence.css',
  host: { class: 'presencia-punto inline-block shrink-0 bg-sonda-viva rounded-radio-pildora' },
})
export class PresenceDot {}

/**
 * La pastilla de presencia: el punto, la cuenta y la palabra. El texto va en
 * `sonda-honda` y nunca en `sonda-viva`, que es relleno y como texto no alcanza
 * contraste. Quien la usa no la pinta si no sabe la cuenta.
 */
@Component({
  selector: 'app-presence-pill',
  imports: [PresenceDot],
  template: `
    <app-presence-dot />
    <span class="tabular-nums">{{ count() }} en línea</span>
  `,
  host: {
    class:
      'etiqueta inline-flex items-center gap-espacio-2 px-espacio-2 py-espacio-1 ' +
      'rounded-radio-pildora bg-sonda-viva/15 text-sonda-honda whitespace-nowrap',
  },
})
export class PresencePill {
  readonly count = input.required<number>();
}
