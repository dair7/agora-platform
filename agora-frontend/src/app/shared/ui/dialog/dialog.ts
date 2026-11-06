import { Component, ElementRef, input, output, viewChild } from '@angular/core';
import { Button, type ButtonVariant } from '../button/button';

let nextId = 0;

/**
 * Diálogo de confirmación sobre el `<dialog>` nativo, abierto con `showModal()`.
 * El navegador pone gratis lo que importa: el resto de la página queda inerte (el
 * foco no sale del diálogo), Escape lo cierra, hay fondo y el rol es el de un
 * diálogo modal. Nada de eso se reimplementa aquí.
 *
 * El texto se proyecta; el título, la acción de confirmar y su variante los pone
 * quien lo usa. Mientras la acción está en curso (`busy`), los dos botones se
 * deshabilitan, Escape no cierra y el de confirmar dice `busyLabel`, como el
 * «Enviando» del componente Botón del sistema.
 *
 * Al cerrarse, el foco vuelve al elemento que lo abrió. Si ese elemento ya no
 * existe —la acción lo quitó de la pantalla—, el foco se queda donde lo deje el
 * navegador.
 */
@Component({
  selector: 'app-dialog',
  imports: [Button],
  template: `
    <dialog
      #dialog
      class="m-auto border-0 bg-superficie-00 text-tinta rounded-radio-md p-espacio-5 shadow-sombra-flotante"
      [attr.aria-labelledby]="titleId"
      (cancel)="onCancel($event)"
      (close)="onClose()"
    >
      <h2 class="titulo-seccion" [id]="titleId">{{ title() }}</h2>
      <div class="cuerpo mt-espacio-2"><ng-content /></div>
      <div class="flex flex-wrap justify-end gap-espacio-3 mt-espacio-5">
        @if (showCancel()) {
          <button appButton variant="secondary" type="button" [disabled]="busy()" (click)="close()">
            Cancelar
          </button>
        }
        <button
          appButton
          type="button"
          [variant]="confirmVariant()"
          [disabled]="busy() || confirmDisabled()"
          (click)="confirmed.emit()"
        >
          {{ busy() ? busyLabel() : confirmLabel() }}
        </button>
      </div>
    </dialog>
  `,
  // El ancho del formulario, sin pasarse del de la pantalla menos su margen: con
  // `w-full max-w-ancho-formulario`, a 360px el diálogo tocaba los dos bordes.
  styles: `
    dialog {
      width: min(var(--ancho-formulario), 100% - 2 * var(--espacio-4));
      max-width: none;
    }
  `,
})
export class Dialog {
  readonly title = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly busyLabel = input.required<string>();
  readonly confirmVariant = input<ButtonVariant>('primary');
  readonly busy = input(false);
  /** Falta algo dentro del diálogo, como elegir una persona. */
  readonly confirmDisabled = input(false);
  /** Un diálogo que solo informa, como el de una contraseña generada, no tiene qué cancelar. */
  readonly showCancel = input(true);

  /** Se pulsó confirmar. Quien lo usa ejecuta la acción y llama a `close()` al terminar. */
  readonly confirmed = output<void>();

  /**
   * Se cerró, por el botón, por Escape o por la acción. Quien guarda algo que no debe
   * sobrevivir al diálogo —una contraseña generada— lo borra aquí, y así no depende de
   * por cuál de las vías se cerró.
   */
  readonly closed = output<void>();

  protected readonly titleId = `dialogo-${nextId++}`;
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  #opener: HTMLElement | null = null;

  open(): void {
    this.#opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.dialogRef().nativeElement.showModal();
  }

  close(): void {
    this.dialogRef().nativeElement.close();
  }

  /** Escape no interrumpe una acción en curso. */
  protected onCancel(event: Event): void {
    if (this.busy()) {
      event.preventDefault();
    }
  }

  protected onClose(): void {
    this.closed.emit();

    if (this.#opener?.isConnected) {
      this.#opener.focus();
    }
    this.#opener = null;
  }
}
