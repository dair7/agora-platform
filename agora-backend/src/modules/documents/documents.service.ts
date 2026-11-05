import { randomUUID } from 'node:crypto';
import { ProjectRole, ProjectStatus } from '@prisma/client';
import type { Project } from '@prisma/client';
import { AppError } from '../../middlewares/error-handler.js';
import type { ProjectAccess } from '../../middlewares/project-access.js';
import type { UploadedFile } from '../../middlewares/upload.js';
import { emitToProject } from '../../sockets/emitter.js';
import { fileStorage, StoredFileNotFoundError } from '../../storage/index.js';
import * as repository from './documents.repository.js';
import type { DocumentRow } from './documents.repository.js';
import type { UploadDocumentInput } from './documents.schema.js';

export type DocumentItem = Omit<DocumentRow, 'storagePath'>;

export interface DocumentDownload {
  name: string;
  mimeType: string;
  content: Buffer;
}

// `storagePath` es un detalle del almacén: no sale de aquí.
const toDocumentItem = ({ storagePath: _storagePath, ...document }: DocumentRow): DocumentItem =>
  document;

/** Mismo criterio que la edición del proyecto: cerrado es de solo lectura. */
const assertProjectOpen = (project: Project): void => {
  if (project.status === ProjectStatus.COMPLETED) {
    throw new AppError(409, 'CONFLICT', 'El proyecto está cerrado y no admite cambios');
  }
};

const getDocument = async (projectId: string, documentId: string): Promise<DocumentRow> => {
  const document = await repository.findDocument(projectId, documentId);

  if (!document) {
    throw new AppError(404, 'NOT_FOUND', 'El documento no existe en este proyecto');
  }

  return document;
};

// La clave la genera el servidor: el nombre que manda el cliente no llega al
// almacén, y dos archivos con el mismo nombre no se pisan. El nombre original vive
// en la metadata y vuelve en la descarga.
const newStoragePath = (projectId: string): string => `projects/${projectId}/${randomUUID()}`;

/**
 * Primero el archivo y después la fila: al revés, un fallo del almacén dejaría una
 * fila que apunta a nada. Si es la fila la que no se escribe, el archivo se retira.
 */
const storeThenPersist = async (
  projectId: string,
  file: UploadedFile,
  persist: (storagePath: string) => Promise<DocumentRow | null>,
): Promise<DocumentRow | null> => {
  const storagePath = newStoragePath(projectId);

  await fileStorage.save(storagePath, file.content, file.mimeType);

  try {
    const document = await persist(storagePath);

    if (!document) {
      await fileStorage.remove(storagePath);
    }

    return document;
  } catch (error) {
    await fileStorage.remove(storagePath);
    throw error;
  }
};

// Después de persistir. Payload `{ projectId }`, como los demás: ver events.ts.
const notifyUploaded = (projectId: string): void => {
  emitToProject(projectId, 'documento:subido', { projectId });
};

const fileData = (file: UploadedFile, userId: string, storagePath: string) => ({
  name: file.name,
  storagePath,
  mimeType: file.mimeType,
  sizeBytes: file.sizeBytes,
  uploadedById: userId,
});

export const listDocuments = async (projectId: string): Promise<DocumentItem[]> => {
  const documents = await repository.findLatestDocuments(projectId);

  return documents.map(toDocumentItem);
};

export const listVersions = async (
  projectId: string,
  documentId: string,
): Promise<DocumentItem[]> => {
  await getDocument(projectId, documentId);

  const chain = await repository.findChain(projectId, documentId);

  return chain.map(toDocumentItem);
};

/**
 * Sin enlaces firmados: solo existen en Supabase, así que habría dos caminos de
 * descarga y uno quedaría sin probar. Con uno solo, el permiso se comprueba en cada
 * descarga y las dos implementaciones se ejercitan igual. Con el tope de 20 MB, el
 * coste de ancho de banda es irrelevante.
 */
export const downloadDocument = async (
  projectId: string,
  documentId: string,
): Promise<DocumentDownload> => {
  const document = await getDocument(projectId, documentId);

  try {
    return {
      name: document.name,
      mimeType: document.mimeType,
      content: await fileStorage.read(document.storagePath),
    };
  } catch (error) {
    if (error instanceof StoredFileNotFoundError) {
      throw new AppError(404, 'NOT_FOUND', 'El archivo de este documento no está disponible');
    }

    throw error;
  }
};

export const uploadDocument = async (
  access: ProjectAccess,
  userId: string,
  file: UploadedFile,
  input: UploadDocumentInput,
): Promise<DocumentItem> => {
  assertProjectOpen(access.project);

  const projectId = access.project.id;
  const document = await storeThenPersist(projectId, file, (storagePath) =>
    repository.createDocument({
      ...fileData(file, userId, storagePath),
      projectId,
      taskId: input.taskId,
    }),
  );

  if (!document) {
    throw new AppError(404, 'NOT_FOUND', 'La tarea no existe en este proyecto');
  }

  notifyUploaded(projectId);

  return toDocumentItem(document);
};

export const uploadVersion = async (
  access: ProjectAccess,
  userId: string,
  documentId: string,
  file: UploadedFile,
): Promise<DocumentItem> => {
  assertProjectOpen(access.project);

  const projectId = access.project.id;

  await getDocument(projectId, documentId);

  const document = await storeThenPersist(projectId, file, (storagePath) =>
    repository.createVersion(projectId, documentId, fileData(file, userId, storagePath)),
  );

  if (!document) {
    throw new AppError(
      409,
      'CONFLICT',
      'Ese documento ya tiene una versión más nueva: sube la nueva versión sobre la última',
    );
  }

  notifyUploaded(projectId);

  return toDocumentItem(document);
};

/**
 * Borra esa versión y su archivo, no la cadena: las demás siguen y se reenlazan.
 * Si se borra la última, la anterior vuelve a serlo.
 */
export const deleteDocument = async (
  access: ProjectAccess,
  userId: string,
  documentId: string,
): Promise<void> => {
  const projectId = access.project.id;
  const document = await getDocument(projectId, documentId);
  const isPrincipal = access.membership?.role === ProjectRole.PRINCIPAL_INVESTIGATOR;

  if (document.uploadedById !== userId && !isPrincipal) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Solo quien subió el documento o el investigador principal puede borrarlo',
    );
  }

  assertProjectOpen(access.project);

  await repository.deleteDocument(projectId, documentId);

  // Después de persistir, y sin esperar al almacén: la fila ya no está.
  emitToProject(projectId, 'documento:modificado', { projectId });

  // Después de la fila, y sin deshacerla si falla: un archivo huérfano no se ve, y
  // una fila sin archivo sí.
  try {
    await fileStorage.remove(document.storagePath);
  } catch (error) {
    console.error(error);
  }
};
