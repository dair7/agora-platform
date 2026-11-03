import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  AddMemberInput,
  CreateProjectInput,
  ListProjectsQuery,
  Member,
  Project,
  ProjectDetail,
  ProjectPage,
  UpdateProjectInput,
} from './projects.types';

/**
 * Cliente tipado de `/api/v1/proyectos`, miembros incluidos. Pasa por el
 * interceptor, así que el token y el refresco silencioso ya van resueltos.
 *
 * Cada método devuelve el objeto, no el sobre: `{ project }` y `{ members }` se
 * desenvuelven aquí y no en cada pantalla.
 */
@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  readonly #http = inject(HttpClient);
  readonly #url = `${environment.apiUrl}/proyectos`;

  /** Solo los proyectos visibles para quien llama: la regla de oro la aplica el backend. */
  list(query: ListProjectsQuery = {}): Promise<ProjectPage> {
    let params = new HttpParams();

    for (const [name, raw] of Object.entries(query)) {
      // El texto se recorta, y si queda vacío no se envía: `buscar=` vacío es un
      // 400, y al cargar la lista por primera vez el campo de búsqueda está vacío.
      const value = typeof raw === 'string' ? raw.trim() : raw;

      if (value !== undefined && value !== '') {
        params = params.set(name, value);
      }
    }

    return firstValueFrom(this.#http.get<ProjectPage>(this.#url, { params }));
  }

  /** Solo la coordinación. */
  async create(input: CreateProjectInput): Promise<Project> {
    const { project } = await firstValueFrom(
      this.#http.post<{ project: Project }>(this.#url, input),
    );

    return project;
  }

  async get(projectId: string): Promise<ProjectDetail> {
    const { project } = await firstValueFrom(
      this.#http.get<{ project: ProjectDetail }>(`${this.#url}/${projectId}`),
    );

    return project;
  }

  /** Solo el investigador principal. */
  async update(projectId: string, input: UpdateProjectInput): Promise<Project> {
    const { project } = await firstValueFrom(
      this.#http.patch<{ project: Project }>(`${this.#url}/${projectId}`, input),
    );

    return project;
  }

  /** Solo el investigador principal. Deja el proyecto en `COMPLETED`, de solo lectura. */
  async close(projectId: string): Promise<Project> {
    const { project } = await firstValueFrom(
      this.#http.post<{ project: Project }>(`${this.#url}/${projectId}/cerrar`, null),
    );

    return project;
  }

  async listMembers(projectId: string): Promise<Member[]> {
    const { members } = await firstValueFrom(
      this.#http.get<{ members: Member[] }>(`${this.#url}/${projectId}/miembros`),
    );

    return members;
  }

  /** Solo el investigador principal. Devuelve la lista completa, no solo el miembro nuevo. */
  async addMember(projectId: string, input: AddMemberInput): Promise<Member[]> {
    const { members } = await firstValueFrom(
      this.#http.post<{ members: Member[] }>(`${this.#url}/${projectId}/miembros`, input),
    );

    return members;
  }

  /** Solo el investigador principal. */
  async removeMember(projectId: string, userId: string): Promise<void> {
    await firstValueFrom(this.#http.delete<void>(`${this.#url}/${projectId}/miembros/${userId}`));
  }
}
