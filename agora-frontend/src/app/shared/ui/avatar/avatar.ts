import { Component, computed, input } from '@angular/core';
import { PresenceDot } from '../presence/presence';

/**
 * Del componente Mensaje del sistema: las iniciales en un círculo, con el punto de
 * presencia encima. El punto lleva un borde del color de lo que tiene detrás, para
 * separarse del avatar; hoy siempre es una tarjeta, `superficie-00`.
 *
 * El punto no se queda solo en el color: el lector de pantalla oye «En línea».
 */
@Component({
  selector: 'app-avatar',
  imports: [PresenceDot],
  template: `
    <span aria-hidden="true">{{ initials() }}</span>
    @if (online()) {
      <app-presence-dot class="avatar-punto border-2 border-superficie-00" />
      <span class="sr-only">En línea</span>
    }
  `,
  styleUrl: './avatar.css',
  host: {
    class:
      'avatar etiqueta grid place-items-center relative shrink-0 ' +
      'bg-superficie-20 text-tinta-media rounded-radio-pildora',
  },
})
export class Avatar {
  readonly name = input.required<string>();
  readonly online = input(false);

  /** Las de las dos primeras palabras: «Andrés Pardo Quintero» es «AP». */
  protected readonly initials = computed(() =>
    this.name()
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? '')
      .join('')
      .toUpperCase(),
  );
}
