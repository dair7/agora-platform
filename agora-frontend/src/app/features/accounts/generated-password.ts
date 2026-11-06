import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';
import { Button } from '../../shared/ui/button/button';
import { Notice } from '../../shared/ui/notice/notice';

/**
 * La contraseña que el cliente acaba de generar, a la vista una sola vez. Vive en este
 * componente mientras está en pantalla y en ningún otro sitio: no va a `localStorage`, a la
 * dirección, a la consola ni a ningún registro, y quien lo usa lo quita de la plantilla al
 * cerrar el diálogo, con lo que se destruye con ella.
 *
 * El foco entra en «Copiar» al aparecer: el campo que lo tenía acaba de desaparecer del
 * diálogo, y sin esto el teclado se quedaría sin sitio.
 *
 * Copiar deja la contraseña en el portapapeles del sistema, y de ahí este componente no la
 * puede sacar: hay que pegarla antes de que otra cosa la reemplace. Limpiarlo al cerrar
 * rompería el uso normal, que es copiar, cerrar y pegar en el medio de entrega.
 */
@Component({
  selector: 'app-generated-password',
  imports: [Button, Notice],
  template: `
    <div class="grid gap-espacio-3">
      <p><ng-content /></p>

      <div class="grid gap-espacio-1">
        <span class="etiqueta text-tinta" id="clave-generada-etiqueta">Contraseña</span>
        <!-- select-all: un clic la selecciona entera, por si el portapapeles falla. -->
        <p
          class="cuerpo-fuerte text-tinta bg-superficie-10 rounded-radio-sm p-espacio-3 select-all wrap-anywhere"
          aria-labelledby="clave-generada-etiqueta"
        >
          {{ password() }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-espacio-3">
        <button #copyButton appButton variant="secondary" type="button" (click)="copy()">
          Copiar contraseña
        </button>
        <!-- Siempre en la plantilla: una región en vivo solo anuncia los cambios de su texto. -->
        <p class="secundario text-tinta-media" role="status">{{ feedback() }}</p>
      </div>

      <app-notice tone="block">
        Esta contraseña no se volverá a mostrar. Entrégala a la persona por un medio seguro, no por
        un canal que otras personas lean.
      </app-notice>
    </div>
  `,
})
export class GeneratedPassword {
  readonly password = input.required<string>();

  protected readonly feedback = signal('');
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(
      () => this.#host.nativeElement.querySelector<HTMLButtonElement>('button')?.focus(),
      { injector: inject(Injector) },
    );
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.password());
      this.feedback.set('Contraseña copiada.');
    } catch {
      // Sin permiso o sin contexto seguro. El texto de arriba se puede seleccionar.
      this.feedback.set('No se pudo copiar. Selecciónala y cópiala a mano.');
    }
  }
}
