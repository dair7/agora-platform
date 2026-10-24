import { Component, computed, input } from '@angular/core';

/**
 * Del componente Aviso del sistema de diseño: una franja que informa sin
 * interrumpir, para lo que afecta a toda la pantalla. No se cierra sola:
 * desaparece cuando la condición que la produjo deja de ser cierta.
 *
 * - `attention`: socket reconectando, tareas atrasadas (`baliza`).
 * - `error`: fallos del servidor o de la red, y los errores de sesión (`arrecife`).
 * - `block`: `CONFLICT`, como un proyecto cerrado (`superficie-20`).
 *
 * Una acción opcional (por ejemplo, reintentar) se proyecta con `[noticeAction]`.
 */
export type NoticeTone = 'attention' | 'error' | 'block';

const TONES: Record<NoticeTone, string> = {
  attention: 'secundario bg-superficie-00 text-tinta border border-borde px-espacio-3 py-espacio-2',
  error: 'cuerpo bg-superficie-00 text-arrecife border border-arrecife px-espacio-4 py-espacio-3',
  block: 'cuerpo bg-superficie-20 text-tinta px-espacio-4 py-espacio-3',
};

@Component({
  selector: 'app-notice',
  template: `
    <span class="flex items-center">
      @if (tone() === 'attention') {
        <span class="size-espacio-2 shrink-0 rounded-radio-pildora bg-baliza mr-espacio-2"></span>
      }
      <span><ng-content /></span>
    </span>
    <ng-content select="[noticeAction]" />
  `,
  host: {
    '[class]': 'classes()',
    // Un error se anuncia en cuanto aparece; los demás, sin interrumpir.
    '[attr.role]': "tone() === 'error' ? 'alert' : 'status'",
  },
})
export class Notice {
  readonly tone = input<NoticeTone>('error');

  protected readonly classes = computed(
    () => 'flex items-center justify-between gap-espacio-3 rounded-radio-md ' + TONES[this.tone()],
  );
}
