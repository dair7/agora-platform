import { Component, computed, input } from '@angular/core';

export type IconName = 'bell' | 'folder' | 'house' | 'log-out' | 'message-circle' | 'user';

/** Solo tamaños de la escala de espaciado: el sistema no tiene una escala de iconos. */
export type IconSize = 'espacio-4' | 'espacio-5';

// Escritas enteras: Tailwind solo genera las clases que encuentra literales en el código.
const SIZES: Record<IconSize, string> = {
  'espacio-4': 'size-espacio-4',
  'espacio-5': 'size-espacio-5',
};

/**
 * Un icono de Lucide 1.70.0, copiado de `lucide-static` sin instalar el paquete: son seis
 * trazados. Licencia ISC, en `public/LICENSE-lucide.txt`, que viaja también en la
 * compilación. Para sumar uno, se copia su `.svg` tal cual: aquí no se dibuja nada. **Antes
 * hay que buscarlo en la lista de iconos heredados de Feather** que trae la licencia de
 * Lucide: esos llevan además el aviso MIT, y `log-out` es uno (ya está en el archivo).
 *
 * Es decorativo, y por eso va con `aria-hidden`: el nombre lo pone quien lo usa, con un
 * texto a la vista o con `sr-only`. Un icono solo deja el control sin nombre.
 *
 * El trazo es `currentColor`, así que toma el color de lo que tenga encima. `viewBox` y
 * `stroke-width` son de la retícula de Lucide, no valores de diseño.
 */
@Component({
  selector: 'app-icon',
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      [attr.class]="sizeClass()"
    >
      @switch (name()) {
        @case ('bell') {
          <path d="M10.268 21a2 2 0 0 0 3.464 0" />
          <path
            d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
          />
        }
        @case ('folder') {
          <path
            d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
          />
        }
        @case ('house') {
          <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
          <path
            d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
          />
        }
        @case ('log-out') {
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        }
        @case ('message-circle') {
          <path
            d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"
          />
        }
        @case ('user') {
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        }
      }
    </svg>
  `,
  host: { class: 'block shrink-0' },
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input<IconSize>('espacio-5');

  protected readonly sizeClass = computed(() => SIZES[this.size()]);
}
