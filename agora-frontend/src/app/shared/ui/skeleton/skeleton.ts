import { Component, computed, input } from '@angular/core';

type Spacing =
  'espacio-1' | 'espacio-2' | 'espacio-3' | 'espacio-4' | 'espacio-5' | 'espacio-6' | 'espacio-8';

/**
 * Todo el contenedor, o un token de espaciado para lo que tiene tamaño fijo (un
 * avatar). Sin fracciones, por convención: `w-1/2` sí genera CSS, porque Tailwind la
 * calcula sin pasar por el tema, pero no sale de ningún token, y el sistema no tiene
 * uno de ancho parcial.
 */
export type SkeletonWidth = 'full' | Spacing;

/** `line` es una línea del estilo de texto que lo rodea (`1lh`): si va dentro de un `cuerpo`, mide lo que medirá el texto. */
export type SkeletonHeight = 'line' | Spacing;

export type SkeletonRadius = 'radio-sm' | 'radio-md' | 'radio-pildora';

// Clases completas y no construidas con plantilla: Tailwind solo genera las que
// encuentra escritas tal cual en el código.
const WIDTHS: Record<SkeletonWidth, string> = {
  full: 'w-full',
  'espacio-1': 'w-espacio-1',
  'espacio-2': 'w-espacio-2',
  'espacio-3': 'w-espacio-3',
  'espacio-4': 'w-espacio-4',
  'espacio-5': 'w-espacio-5',
  'espacio-6': 'w-espacio-6',
  'espacio-8': 'w-espacio-8',
};

const HEIGHTS: Record<SkeletonHeight, string> = {
  line: 'h-lh',
  'espacio-1': 'h-espacio-1',
  'espacio-2': 'h-espacio-2',
  'espacio-3': 'h-espacio-3',
  'espacio-4': 'h-espacio-4',
  'espacio-5': 'h-espacio-5',
  'espacio-6': 'h-espacio-6',
  'espacio-8': 'h-espacio-8',
};

const RADII: Record<SkeletonRadius, string> = {
  'radio-sm': 'rounded-radio-sm',
  'radio-md': 'rounded-radio-md',
  'radio-pildora': 'rounded-radio-pildora',
};

/**
 * Un bloque con la forma del contenido que va a llegar, no un spinner: con la
 * forma correcta no hay salto de maquetación cuando llegan los datos, y se
 * percibe más rápido que un disco girando en el centro.
 *
 * Es un primitivo: la pantalla compone varios para dibujar la silueta de una
 * tarjeta o de una fila. El relleno es `superficie-20`, el que el sistema de
 * diseño reserva para los esqueletos. No se anima: el latido de la presencia es
 * el único movimiento continuo del sistema.
 *
 * Es decorativo y se oculta al lector de pantalla. Quien lo compone anuncia la
 * carga con `app-loading-status`, y marca su contenedor con `aria-busy`.
 */
@Component({
  selector: 'app-skeleton',
  template: '',
  host: {
    '[class]': 'classes()',
    'aria-hidden': 'true',
  },
})
export class Skeleton {
  readonly width = input<SkeletonWidth>('full');
  readonly height = input<SkeletonHeight>('line');
  readonly radius = input<SkeletonRadius>('radio-sm');

  protected readonly classes = computed(
    () =>
      'block shrink-0 bg-superficie-20 ' +
      `${WIDTHS[this.width()]} ${HEIGHTS[this.height()]} ${RADII[this.radius()]}`,
  );
}

/**
 * El anuncio de la carga para el lector de pantalla, invisible en la pantalla.
 *
 * Va siempre en la plantilla, también cuando no carga: una región `aria-live`
 * solo anuncia los cambios de su texto, y si apareciera ya con el texto puesto
 * muchos lectores no dirían nada. Por eso lo que cambia es el texto, no la región.
 *
 * Va fuera del contenedor con `aria-busy`, no dentro: algunos lectores retienen
 * los anuncios de lo que está marcado como ocupado hasta que deja de estarlo.
 */
@Component({
  selector: 'app-loading-status',
  template: `{{ loading() ? label() : '' }}`,
  host: {
    class: 'sr-only',
    role: 'status',
    'aria-live': 'polite',
  },
})
export class LoadingStatus {
  readonly loading = input.required<boolean>();
  readonly label = input('Cargando…');
}
