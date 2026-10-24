import { Component, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'destructive';

// Del componente Botón del sistema de diseño. Una sola acción primaria por
// pantalla: si dos botones `veril` compiten, uno de los dos es secundario.
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-veril text-tinta-inversa border-transparent hover:enabled:bg-veril-hundido active:enabled:bg-veril-hundido',
  secondary: 'bg-superficie-00 text-tinta border-borde-fuerte',
  subtle: 'bg-transparent text-veril border-transparent',
  destructive: 'bg-arrecife text-tinta-inversa border-transparent',
};

/**
 * Atributo sobre un `<button>` nativo, no un componente que lo envuelva: así el
 * botón conserva su teclado, su foco, su `type` y su `disabled` sin reimplementarlos.
 * El texto lo pone quien lo usa y dice exactamente qué ocurre al pulsarlo.
 */
@Component({
  selector: 'button[appButton]',
  template: '<ng-content />',
  host: { '[class]': 'classes()' },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');

  protected readonly classes = computed(
    () =>
      'cuerpo-fuerte px-espacio-4 py-espacio-3 rounded-radio-md border cursor-pointer ' +
      'disabled:cursor-not-allowed disabled:opacity-opacidad-deshabilitado ' +
      VARIANTS[this.variant()],
  );
}
