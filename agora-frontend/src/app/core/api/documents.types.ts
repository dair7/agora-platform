// Tipos del contrato de /api/v1/proyectos/:projectId/documentos (`modules/documents`).

import type { UserSummary } from './users.types';

/**
 * Una versión de un documento. La cadena es una lista enlazada hacia atrás: cada fila
 * apunta a la anterior, y la última es la que nadie referencia. Los números no se
 * reescriben al borrar, así que pueden quedar `3, 1`.
 */
export interface ProjectDocument {
  id: string;
  projectId: string;
  taskId: string | null;
  uploadedById: string;
  uploadedBy: UserSummary;
  name: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  previousVersionId: string | null;
  createdAt: string;
}

/** `name` es `null` si la respuesta no trae uno legible. */
export interface DownloadedFile {
  blob: Blob;
  name: string | null;
}
