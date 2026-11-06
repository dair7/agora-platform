import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toQueryParams } from './query-params';
import type { MyTasksPage, ProjectFiguresPage, ReportSummary, TaskFigures } from './reports.types';

/**
 * Las cifras agregadas. Todas salen de la base: aquí no se suma nada, porque pedir listas y
 * sumar en el navegador funciona con tres proyectos y revienta con cincuenta.
 */
@Injectable({ providedIn: 'root' })
export class ReportsApi {
  readonly #http = inject(HttpClient);

  /** Solo la coordinación. */
  async summary(): Promise<ReportSummary> {
    const { summary } = await firstValueFrom(
      this.#http.get<{ summary: ReportSummary }>(`${environment.apiUrl}/reportes/resumen`),
    );

    return summary;
  }

  /** Solo la coordinación. Lo más atrasado primero. */
  projects(pagina: number): Promise<ProjectFiguresPage> {
    return firstValueFrom(
      this.#http.get<ProjectFiguresPage>(`${environment.apiUrl}/reportes/proyectos`, {
        params: toQueryParams({ pagina }),
      }),
    );
  }

  /** De un proyecto: quien no es miembro recibe `404`. */
  async projectFigures(projectId: string): Promise<TaskFigures> {
    const { figures } = await firstValueFrom(
      this.#http.get<{ figures: TaskFigures }>(
        `${environment.apiUrl}/proyectos/${projectId}/cifras`,
      ),
    );

    return figures;
  }

  /** Lo pendiente de quien pregunta, en todos sus proyectos. La coordinación recibe `403`. */
  myTasks(): Promise<MyTasksPage> {
    return firstValueFrom(this.#http.get<MyTasksPage>(`${environment.apiUrl}/mis-tareas`));
  }
}
