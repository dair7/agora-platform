import { Component, computed, input } from '@angular/core';
import type { PhaseStatus } from '../../../core/api/phases.types';
import type { TaskStatus } from '../../../core/api/tasks.types';

export type WorkStatus = PhaseStatus | TaskStatus;

/**
 * El estado de una fase o de una tarea, con la misma forma que la píldora de proyecto y
 * los mismos tokens: lo que todavía no empezó se lee inactivo, lo que corre va en
 * `veril`, lo terminado en `tinta`, y `baliza` es atención sin ser un error. `arrecife`
 * no aparece: está reservado a errores y a borrar.
 */
const STATUS: Record<WorkStatus, { label: string; classes: string }> = {
  PENDING: { label: 'Pendiente', classes: 'bg-superficie-20 text-tinta-media' },
  TODO: { label: 'Por hacer', classes: 'bg-superficie-20 text-tinta-media' },
  IN_PROGRESS: { label: 'En curso', classes: 'bg-estado-ejecucion text-tinta-inversa' },
  IN_REVIEW: { label: 'En revisión', classes: 'bg-estado-planeacion text-tinta' },
  BLOCKED: { label: 'Bloqueada', classes: 'bg-baliza text-tinta' },
  DONE: { label: 'Terminada', classes: 'bg-estado-cierre text-tinta-inversa' },
  COMPLETED: { label: 'Terminada', classes: 'bg-estado-cierre text-tinta-inversa' },
};

/** El texto de un estado, para quien lo ofrece fuera de la píldora: los desplegables. */
export const workStatusLabel = (status: WorkStatus): string => STATUS[status].label;

@Component({
  selector: 'app-work-status',
  template: '{{ label() }}',
  host: { '[class]': 'classes()' },
})
export class WorkStatusPill {
  readonly status = input.required<WorkStatus>();

  protected readonly label = computed(() => STATUS[this.status()].label);
  protected readonly classes = computed(
    () =>
      'etiqueta inline-block px-espacio-2 py-espacio-1 rounded-radio-sm whitespace-nowrap ' +
      STATUS[this.status()].classes,
  );
}
