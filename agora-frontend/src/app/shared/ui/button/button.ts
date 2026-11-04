import { Component, computed, input } from '@angular/core';

export type ButtonVariant =
  'primary' | 'secondary' | 'subtle' | 'destructive' | 'subtle-destructive';

// Del componente Botón del sistema de diseño. Una sola acción primaria por
// pantalla: si dos botones `veril` compiten, uno de los dos es secundario.
// La forma de píldora dice "esto se pulsa"; las superficies son rectángulos.
//
// `subtle-destructive` es el discreto con el texto en `arrecife` (5.69:1 sobre
// `superficie-00`): para una acción destructiva repetida en una lista, donde un
// relleno rojo por fila haría un muro de rojo y el discreto en `veril` engañaría,
// porque ese es el color de la acción normal. El relleno `destructive` se queda
// para el compromiso de verdad: el botón de confirmar del diálogo.
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-veril text-tinta-inversa border-transparent hover:enabled:bg-veril-hundido active:enabled:bg-veril-hundido',
  secondary: 'bg-superficie-00 text-tinta border-borde-fuerte',
  subtle: 'bg-transparent text-veril border-transparent',
  destructive: 'bg-arrecife text-tinta-inversa border-transparent',
  'subtle-destructive': 'bg-transparent text-arrecife border-transparent',
};

/**
 * Atributo sobre un `<button>` nativo, no un componente que lo envuelva: así el
 * botón conserva su teclado, su foco, su `type` y su `disabled` sin reimplementarlos.
 * El texto lo pone quien lo usa y dice exactamente qué ocurre al pulsarlo.
 *
 * También vale sobre un `<a>`, para la navegación que se ve como botón («Volver a
 * proyectos»): sigue siendo un enlace, con su teclado y su menú contextual.
 */
@Component({
  selector: 'button[appButton], a[appButton]',
  template: '<ng-content />',
  host: { '[class]': 'classes()' },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');

  protected readonly classes = computed(
    () =>
      'inline-block cuerpo-fuerte px-espacio-4 py-espacio-3 rounded-radio-pildora border cursor-pointer ' +
      'disabled:cursor-not-allowed disabled:opacity-opacidad-deshabilitado ' +
      VARIANTS[this.variant()],
  );
}
