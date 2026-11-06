import type { TaskFigures } from '../api/reports.types';

const counts = new Intl.NumberFormat('es-CO');

/** «1.535»: las cifras de los reportes pueden pasar de mil. */
export const formatCount = (value: number): string => counts.format(value);

/**
 * «3 de 8 completadas (38%)». Sin tareas no hay cifra: un 0% diría que no se ha hecho nada,
 * y no hay nada que hacer.
 */
export const formatCompleted = ({ total, completed, completedPercent }: TaskFigures): string =>
  total === 0
    ? 'Sin tareas'
    : `${formatCount(completed)} de ${formatCount(total)} ${
        total === 1 ? 'completada' : 'completadas'
      } (${completedPercent}%)`;

export const formatOverdue = (overdue: number): string =>
  overdue === 1 ? '1 atrasada' : `${formatCount(overdue)} atrasadas`;
