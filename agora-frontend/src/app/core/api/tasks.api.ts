import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { CreateTaskInput, Task, UpdateTaskInput } from './tasks.types';

/** Cliente tipado de las tareas de un proyecto. Devuelve el objeto, no el sobre. */
@Injectable({ providedIn: 'root' })
export class TasksApi {
  readonly #http = inject(HttpClient);

  /** Por la posición de la fase y, dentro de ella, por antigüedad. */
  async list(projectId: string): Promise<Task[]> {
    const { tasks } = await firstValueFrom(this.#http.get<{ tasks: Task[] }>(this.#url(projectId)));

    return tasks;
  }

  async create(projectId: string, input: CreateTaskInput): Promise<Task> {
    const { task } = await firstValueFrom(
      this.#http.post<{ task: Task }>(this.#url(projectId), input),
    );

    return task;
  }

  async update(projectId: string, taskId: string, input: UpdateTaskInput): Promise<Task> {
    const { task } = await firstValueFrom(
      this.#http.patch<{ task: Task }>(`${this.#url(projectId)}/${taskId}`, input),
    );

    return task;
  }

  async remove(projectId: string, taskId: string): Promise<void> {
    await firstValueFrom(this.#http.delete<void>(`${this.#url(projectId)}/${taskId}`));
  }

  /** `409` si ya existe o si cerraría un ciclo. */
  async addDependency(projectId: string, taskId: string, dependsOnTaskId: string): Promise<Task> {
    const { task } = await firstValueFrom(
      this.#http.post<{ task: Task }>(`${this.#url(projectId)}/${taskId}/dependencias`, {
        dependsOnTaskId,
      }),
    );

    return task;
  }

  async removeDependency(projectId: string, taskId: string, dependsOnId: string): Promise<void> {
    await firstValueFrom(
      this.#http.delete<void>(`${this.#url(projectId)}/${taskId}/dependencias/${dependsOnId}`),
    );
  }

  #url(projectId: string): string {
    return `${environment.apiUrl}/proyectos/${projectId}/tareas`;
  }
}
