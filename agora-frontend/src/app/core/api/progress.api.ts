import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { CreateProgressInput, ProgressEntry, UpdateProgressInput } from './progress.types';

/** Cliente tipado de los avances de un proyecto. Devuelve el objeto, no el sobre. */
@Injectable({ providedIn: 'root' })
export class ProgressApi {
  readonly #http = inject(HttpClient);

  /** Lo más reciente primero. */
  async list(projectId: string): Promise<ProgressEntry[]> {
    const { progress } = await firstValueFrom(
      this.#http.get<{ progress: ProgressEntry[] }>(this.#url(projectId)),
    );

    return progress;
  }

  async create(projectId: string, input: CreateProgressInput): Promise<ProgressEntry> {
    const { progress } = await firstValueFrom(
      this.#http.post<{ progress: ProgressEntry }>(this.#url(projectId), input),
    );

    return progress;
  }

  /** Solo quien lo escribió. */
  async update(
    projectId: string,
    progressId: string,
    input: UpdateProgressInput,
  ): Promise<ProgressEntry> {
    const { progress } = await firstValueFrom(
      this.#http.patch<{ progress: ProgressEntry }>(`${this.#url(projectId)}/${progressId}`, input),
    );

    return progress;
  }

  /** Quien lo escribió o el investigador principal. */
  async remove(projectId: string, progressId: string): Promise<void> {
    await firstValueFrom(this.#http.delete<void>(`${this.#url(projectId)}/${progressId}`));
  }

  #url(projectId: string): string {
    return `${environment.apiUrl}/proyectos/${projectId}/avances`;
  }
}
