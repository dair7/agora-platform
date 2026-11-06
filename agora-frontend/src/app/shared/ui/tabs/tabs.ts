import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
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

/** Lo que falta por desplazar por debajo de esto ya no se nota: es redondeo de subpíxel. */
const SCROLL_TOLERANCE_PX = 1;

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
 * Se desplaza en horizontal si no cabe. `relative` no sobra: el texto `sr-only` de la cifra es
 * absoluto, y sin eso escapa del `overflow` y ensancha la página.
 *
 * Dos cosas avisan de que hay más: la activa se lleva a la vista, y cada borde con algo
 * por desplazar lleva un degradado de `superficie-00`, que es lo que hay debajo. Es
 * decorativo: el lector de pantalla ya recorre todos los enlaces.
 *
 * La lista va en un contenedor propio porque es lo único que cambia de ancho cuando
 * cargan las fuentes o aparece una pestaña, sin que cambie el de la barra.
 */
@Component({
  selector: 'app-tabs',
  imports: [RouterLink, RouterLinkActive, UnreadBadge],
  template: `
    <nav
      #scroller
      class="relative overflow-x-auto scroll-px-espacio-6 bg-superficie-00 border border-borde rounded-radio-md p-espacio-1"
      [attr.aria-label]="label()"
      (scroll)="measureEdges()"
      (focusin)="reveal($event.target)"
    >
      <div #list class="flex w-max gap-espacio-1">
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
      </div>
    </nav>
    @if (moreBefore()) {
      <span
        class="tabs-borde tabs-borde-inicio bg-linear-to-r from-superficie-00 to-transparent"
        aria-hidden="true"
      ></span>
    }
    @if (moreAfter()) {
      <span
        class="tabs-borde tabs-borde-fin bg-linear-to-l from-superficie-00 to-transparent"
        aria-hidden="true"
      ></span>
    }
  `,
  styleUrl: './tabs.css',
  host: { class: 'block relative' },
})
export class Tabs {
  readonly label = input.required<string>();
  readonly items = input.required<readonly TabItem[]>();

  protected readonly activeClasses = ACTIVE;
  protected readonly inactiveClasses = INACTIVE;
  protected readonly moreBefore = signal(false);
  protected readonly moreAfter = signal(false);

  // `private` de TypeScript: `viewChild` no admite los campos privados de ES.
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      // La primera medición llega después de pintar: `aria-current` ya está puesto.
      const observer = new ResizeObserver(() => {
        this.reveal(this.scroller().nativeElement.querySelector('[aria-current="page"]'));
        this.measureEdges();
      });

      observer.observe(this.scroller().nativeElement);
      observer.observe(this.list().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected measureEdges(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.scroller().nativeElement;

    this.moreBefore.set(scrollLeft > SCROLL_TOLERANCE_PX);
    this.moreAfter.set(scrollWidth - clientWidth - scrollLeft > SCROLL_TOLERANCE_PX);
  }

  /**
   * Centrada, para que el degradado no la tape y el anillo de foco no se recorte al tabular.
   * A mano y no con `scrollIntoView`, que movería también la página.
   */
  protected reveal(tab: EventTarget | null): void {
    const scroller = this.scroller().nativeElement;

    if (tab instanceof HTMLElement) {
      scroller.scrollLeft = tab.offsetLeft - (scroller.clientWidth - tab.offsetWidth) / 2;
    }
  }
}
