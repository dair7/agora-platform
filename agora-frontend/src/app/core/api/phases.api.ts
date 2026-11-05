import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { CreatePhaseInput, Phase, UpdatePhaseInput } from './phases.types';

/** Cliente tipado del cronograma de un proyecto. Devuelve el objeto, no el sobre. */
@Injectable({ providedIn: 'root' })
export class PhasesApi {
  readonly #http = inject(HttpClient);

  /** Ordenadas por `position`. */
  async list(projectId: string): Promise<Phase[]> {
    const { phases } = await firstValueFrom(
      this.#http.get<{ phases: Phase[] }>(this.#url(projectId)),
    );

    return phases;
  }

  async create(projectId: string, input: CreatePhaseInput): Promise<Phase> {
    const { phase } = await firstValueFrom(
      this.#http.post<{ phase: Phase }>(this.#url(projectId), input),
    );

    return phase;
  }

  async update(projectId: string, phaseId: string, input: UpdatePhaseInput): Promise<Phase> {
    const { phase } = await firstValueFrom(
      this.#http.patch<{ phase: Phase }>(`${this.#url(projectId)}/${phaseId}`, input),
    );

    return phase;
  }

  /** `409` si la fase tiene tareas. */
  async remove(projectId: string, phaseId: string): Promise<void> {
    await firstValueFrom(this.#http.delete<void>(`${this.#url(projectId)}/${phaseId}`));
  }

  /**
   * Manda el orden entero y el que se vio antes de mover. `409` si el real ya no es ese:
   * alguien lo cambió mientras tanto, y no se escribió nada.
   */
  async reorder(
    projectId: string,
    phaseIds: readonly string[],
    expectedPhaseIds: readonly string[],
  ): Promise<Phase[]> {
    const { phases } = await firstValueFrom(
      this.#http.put<{ phases: Phase[] }>(`${this.#url(projectId)}/orden`, {
        phaseIds,
        expectedPhaseIds,
      }),
    );

    return phases;
  }

  #url(projectId: string): string {
    return `${environment.apiUrl}/proyectos/${projectId}/fases`;
  }
}
