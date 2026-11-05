import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { fileNameFromDisposition } from './document-files';
import type { DownloadedFile, ProjectDocument } from './documents.types';

/**
 * Cliente tipado de los documentos de un proyecto. Devuelve el objeto, no el sobre.
 *
 * Las subidas no informan de su progreso: la aplicación usa `withFetch()`, y `fetch` no
 * lo da. Quien sube lo dice de otra forma: ver `DocumentUpload`.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  readonly #http = inject(HttpClient);

  /** Solo la última versión de cada cadena. */
  async list(projectId: string): Promise<ProjectDocument[]> {
    const { documents } = await firstValueFrom(
      this.#http.get<{ documents: ProjectDocument[] }>(this.#url(projectId)),
    );

    return documents;
  }

  /** La cadena entera desde cualquiera de sus versiones, de la más nueva a la más vieja. */
  async versions(projectId: string, documentId: string): Promise<ProjectDocument[]> {
    const { documents } = await firstValueFrom(
      this.#http.get<{ documents: ProjectDocument[] }>(
        `${this.#url(projectId)}/${documentId}/versiones`,
      ),
    );

    return documents;
  }

  upload(projectId: string, file: File, taskId?: string): Promise<ProjectDocument> {
    const form = new FormData();

    if (taskId) {
      form.append('taskId', taskId);
    }

    return this.#send(this.#url(projectId), form, file);
  }

  /** `409` si esa ya no es la última versión. La nueva hereda la tarea. */
  uploadVersion(projectId: string, documentId: string, file: File): Promise<ProjectDocument> {
    return this.#send(`${this.#url(projectId)}/${documentId}/versiones`, new FormData(), file);
  }

  /**
   * Con el token, como cualquier otra petición: no hay enlace público. `Content-Disposition`
   * se puede leer porque el backend lo declara en `exposedHeaders`.
   */
  async download(projectId: string, documentId: string): Promise<DownloadedFile> {
    const response = await firstValueFrom(
      this.#http.get(`${this.#url(projectId)}/${documentId}/descarga`, {
        observe: 'response',
        responseType: 'blob',
      }),
    );

    return {
      blob: response.body ?? new Blob(),
      name: fileNameFromDisposition(response.headers.get('Content-Disposition')),
    };
  }

  /** Borra esa versión, no la cadena. */
  async remove(projectId: string, documentId: string): Promise<void> {
    await firstValueFrom(this.#http.delete<void>(`${this.#url(projectId)}/${documentId}`));
  }

  async #send(url: string, form: FormData, file: File): Promise<ProjectDocument> {
    form.append('file', file, file.name);

    const { document } = await firstValueFrom(
      this.#http.post<{ document: ProjectDocument }>(url, form),
    );

    return document;
  }

  #url(projectId: string): string {
    return `${environment.apiUrl}/proyectos/${projectId}/documentos`;
  }
}
