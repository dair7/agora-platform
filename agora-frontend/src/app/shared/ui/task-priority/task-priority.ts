import { Component, computed, input } from '@angular/core';
import type { TaskPriority } from '../../../core/api/tasks.types';

/**
 * La prioridad de una tarea, con la forma de la píldora de estado (`app-work-status`) pero
 * de contorno: el relleno es del estado, y las dos juntas se distinguen sin leerlas. El
 * sistema no tiene color de prioridad y no se inventa uno: manda la profundidad, como en
 * los estados de proyecto. Más oscuro el contorno y el texto, más urgente.
 *
 * El contorno es decorativo: la palabra dice la prioridad, así que ningún contraste del
 * borde carga con información. `baliza` no sirve: ya es «Bloqueada» y «Atrasada», y una
 * prioridad alta no es una avería.
 */
const PRIORITY: Record<TaskPriority, { label: string; classes: string }> = {
  LOW: { label: 'Prioridad baja', classes: 'border-borde text-tinta-media' },
  MEDIUM: { label: 'Prioridad media', classes: 'border-veril-somero text-tinta' },
  HIGH: { label: 'Prioridad alta', classes: 'border-tinta text-tinta' },
};

@Component({
  selector: 'app-task-priority',
  template: '{{ label() }}',
  host: { '[class]': 'classes()' },
})
export class TaskPriorityPill {
  readonly priority = input.required<TaskPriority>();

  protected readonly label = computed(() => PRIORITY[this.priority()].label);
  protected readonly classes = computed(
    () =>
      'etiqueta inline-block px-espacio-2 py-espacio-1 rounded-radio-sm whitespace-nowrap border bg-superficie-00 ' +
      PRIORITY[this.priority()].classes,
  );
}
