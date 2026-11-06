import { Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';

/**
 * «Cuenta», en la barra inferior. La barra no tiene sitio para el nombre, y por eso abre
 * este panel: quien mira sigue pudiendo saber con qué cuenta está. Por encima de `md` el
 * nombre y el cierre de sesión van a la vista en la barra superior.
 *
 * El panel se posiciona contra la barra y no contra el botón, para no salirse a 360px.
 */
@Component({
  selector: 'app-account-menu',
  imports: [Button, Icon],
  template: `
    <button
      #opener
      appButton
      variant="subtle"
      type="button"
      class="etiqueta w-full flex! flex-col items-center px-espacio-1! py-espacio-1! aria-expanded:bg-veril-tenue"
      aria-controls="cuenta"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
    >
      <app-icon name="user" />
      Cuenta
    </button>

    <!-- Justo después del botón: el foco entra con Tab, sin mover nada a mano. -->
    @if (open()) {
      <section
        id="cuenta"
        aria-label="Cuenta"
        class="absolute bottom-full left-espacio-4 right-espacio-4 mb-espacio-1 grid gap-espacio-3 bg-superficie-00 border border-borde rounded-radio-md p-espacio-4 shadow-sombra-flotante"
      >
        <div class="wrap-anywhere">
          <p class="cuerpo-fuerte text-tinta">{{ name() }}</p>
          <p class="secundario text-tinta-media">{{ role() }}</p>
        </div>
        <button
          appButton
          variant="secondary"
          type="button"
          class="inline-flex! items-center justify-center gap-espacio-2"
          [disabled]="leaving()"
          (click)="leave.emit()"
        >
          <app-icon name="log-out" size="espacio-4" />
          {{ leaving() ? 'Cerrando sesión…' : 'Cerrar sesión' }}
        </button>
      </section>
    }
  `,
  host: {
    '(document:click)': 'closeOutside($event)',
    '(document:keydown.escape)': 'closeWithEscape()',
    '(focusout)': 'closeWhenFocusLeaves($event)',
  },
})
export class AccountMenu {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly opener = viewChild.required('opener', { read: ElementRef });

  readonly name = input.required<string>();
  readonly role = input.required<string>();
  readonly leaving = input(false);
  readonly leave = output<void>();

  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  protected closeOutside(event: Event): void {
    if (this.open() && !event.composedPath().includes(this.#host.nativeElement)) {
      this.open.set(false);
    }
  }

  protected closeWithEscape(): void {
    if (this.open()) {
      this.open.set(false);
      (this.opener().nativeElement as HTMLElement).focus();
    }
  }

  /** Con el teclado: pasar de largo no deja el panel abierto tapando lo que hay detrás. */
  protected closeWhenFocusLeaves({ relatedTarget }: FocusEvent): void {
    if (relatedTarget instanceof Node && !this.#host.nativeElement.contains(relatedTarget)) {
      this.open.set(false);
    }
  }
}
