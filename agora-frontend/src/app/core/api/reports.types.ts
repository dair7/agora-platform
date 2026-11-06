import type { ProjectStatus } from './projects.types';
import type { TaskPriority, TaskStatus } from './tasks.types';

/**
 * Las cifras de tareas. Son «completadas», nunca «avance»: los avances son textos, y esta
 * cifra no los mide.
 */
export interface TaskFigures {
  total: number;
  completed: number;
  /** `null` sin tareas: un proyecto vacío no tiene cifra, y un 0% diría otra cosa. */
  completedPercent: number | null;
  overdue: number;
}

export interface ReportSummary {
  projects: { total: number; byStatus: Record<ProjectStatus, number> };
  tasks: TaskFigures;
}

export interface ProjectFigures {
  id: string;
  title: string;
  status: ProjectStatus;
  tasks: TaskFigures;
}

export interface ProjectFiguresPage {
  items: ProjectFigures[];
  total: number;
  page: number;
  perPage: number;
}

export interface MyTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Columna `date`: se lee en UTC, como las fechas del proyecto. */
  dueDate: string | null;
  overdue: boolean;
  phase: { id: string; name: string };
  project: { id: string; title: string; status: ProjectStatus };
}

export interface MyTasksPage {
  tasks: MyTask[];
  /** Todas las pendientes, aunque la lista traiga menos. */
  total: number;
  overdueCount: number;
}
