import { Component, computed, input } from '@angular/core';
import type { ProjectStatus } from '../../../core/api/projects.types';

/**
 * Del componente EstadoProyecto del sistema de diseño. El texto no es opcional:
 * el color acompaña la lectura, no la sustituye.
 *
 * El sistema define tres profundidades y `ProjectStatus` tiene cinco valores.
 * Los dos que faltaban salen de tokens que ya existen, sin agregar ninguno:
 *
 * - `ON_HOLD` va en `baliza`, que es "atención no bloqueante, solo relleno,
 *   encima va tinta": exactamente lo que es un proyecto en pausa.
 * - `CANCELLED` va en `superficie-20` con `tinta-media` (5.4:1), que se lee como
 *   inactivo. `arrecife` no sirve: está reservado a errores y a borrar.
 *
 * El radio es `radio-sm` y no `radio-pildora`, a propósito: lo que se pulsa es
 * redondo y lo que se lee tiene esquinas suaves. Esta píldora se lee.
 */
const STATUS: Record<ProjectStatus, { label: string; classes: string }> = {
  PLANNING: { label: 'En planeación', classes: 'bg-estado-planeacion text-tinta' },
  IN_PROGRESS: { label: 'En ejecución', classes: 'bg-estado-ejecucion text-tinta-inversa' },
  ON_HOLD: { label: 'En pausa', classes: 'bg-baliza text-tinta' },
  COMPLETED: { label: 'Finalizado', classes: 'bg-estado-cierre text-tinta-inversa' },
  CANCELLED: { label: 'Cancelado', classes: 'bg-superficie-20 text-tinta-media' },
};

/** El texto de un estado, para quien lo ofrece fuera de la píldora: el desplegable de editar. */
export const projectStatusLabel = (status: ProjectStatus): string => STATUS[status].label;

/** En el orden del ciclo de un proyecto. */
export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'PLANNING',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
];

// Literales y completas: Tailwind solo genera las clases que encuentra escritas.
const FILLS: Record<ProjectStatus, string> = {
  PLANNING: 'bg-estado-planeacion',
  IN_PROGRESS: 'bg-estado-ejecucion',
  ON_HOLD: 'bg-baliza',
  COMPLETED: 'bg-estado-cierre',
  CANCELLED: 'bg-superficie-20',
};

/** El relleno de un estado sin su texto, para quien lo pinta al lado de su nombre. */
export const projectStatusFill = (status: ProjectStatus): string => FILLS[status];

@Component({
  selector: 'app-project-status',
  template: '{{ label() }}',
  host: { '[class]': 'classes()' },
})
export class ProjectStatusPill {
  readonly status = input.required<ProjectStatus>();

  protected readonly label = computed(() => STATUS[this.status()].label);
  protected readonly classes = computed(
    () =>
      'etiqueta inline-block px-espacio-2 py-espacio-1 rounded-radio-sm whitespace-nowrap ' +
      STATUS[this.status()].classes,
  );
}
