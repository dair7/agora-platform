import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { UnreadBadge } from '../unread-badge/unread-badge';

export interface TabItem {
  label: string;
  link: readonly string[];
  /** La ruta base solo se marca si coincide entera: si no, estaría activa en todas. */
  exact?: boolean;
  /** Sin leer. Sin valor, o en cero, no se pinta. */
  badge?: number;
}

// Literales y completas: Tailwind solo genera las clases que encuentra escritas.
const BASE = 'block whitespace-nowrap px-espacio-4 py-espacio-2 rounded-radio-sm border ';
const ACTIVE = `${BASE}cuerpo-fuerte bg-veril-tenue text-tinta border-veril`;
const INACTIVE = `${BASE}cuerpo text-tinta-media border-transparent hover:bg-superficie-10`;

/**
 * Las pestañas de una sección con rutas propias. Son enlaces en un `<nav>` y no un
 * `tablist`: cada una lleva a una URL, y `aria-current` dice cuál es la actual.
 *
 * La barra va sobre `superficie-00` y no suelta sobre el fondo de la página: `veril-tenue`
 * sobre `superficie-10` da 1.11:1, y es lo que hizo que el chip de filtro seleccionado
 * se leyera como el más apagado. La activa lleva el texto más oscuro de la fila, peso y
 * borde en `veril`: la distinguen tres cosas, y ninguna es solo el color del fondo. No
 * lleva relleno `veril`, que es de la única acción primaria de la pantalla.
 *
 * Se desplaza en horizontal si no cabe.
 */
@Component({
  selector: 'app-tabs',
  imports: [RouterLink, RouterLinkActive, UnreadBadge],
  template: `
    <nav
      class="flex gap-espacio-1 overflow-x-auto bg-superficie-00 border border-borde rounded-radio-md p-espacio-1"
      [attr.aria-label]="label()"
    >
      @for (tab of items(); track tab.label) {
        <a
          #active="routerLinkActive"
          [routerLink]="tab.link"
          routerLinkActive
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="{ exact: tab.exact ?? false }"
          [class]="active.isActive ? activeClasses : inactiveClasses"
        >
          {{ tab.label }}
          @if (tab.badge; as badge) {
            <app-unread-badge class="ml-espacio-2" [count]="badge" />
          }
        </a>
      }
    </nav>
  `,
  host: { class: 'block' },
})
export class Tabs {
  readonly label = input.required<string>();
  readonly items = input.required<readonly TabItem[]>();

  protected readonly activeClasses = ACTIVE;
  protected readonly inactiveClasses = INACTIVE;
}
