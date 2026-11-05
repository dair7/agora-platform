import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { lockSchedule } from '../phases/phases.repository.js';
import { userSummarySelect } from '../users/users.repository.js';

interface FileData {
  name: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
}

interface CreateDocumentData extends FileData {
  projectId: string;
  taskId?: string;
}

const documentInclude = {
  uploadedBy: { select: userSummarySelect },
} satisfies Prisma.DocumentInclude;

export type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

/**
 * La lista por defecto: la cabeza de cada cadena. La cabeza es la versión de la
 * que no sale ninguna otra; el esquema no guarda una marca de «última», así que no
 * hay nada que se pueda desincronizar.
 */
export const findLatestDocuments = (projectId: string): Promise<DocumentRow[]> =>
  prisma.document.findMany({
    where: { projectId, nextVersion: { is: null } },
    include: documentInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

/** Filtra también por proyecto: un documento de otro proyecto aquí no existe. */
export const findDocument = (projectId: string, documentId: string): Promise<DocumentRow | null> =>
  prisma.document.findFirst({ where: { id: documentId, projectId }, include: documentInclude });

/**
 * La cadena completa desde cualquiera de sus versiones, de la más nueva a la más
 * vieja. El esquema no tiene identificador de cadena, solo el enlace a la anterior,
 * así que se recorre en memoria: un proyecto tiene decenas de documentos, y recorrer
 * con una consulta por eslabón sería peor.
 */
export const findChain = async (projectId: string, documentId: string): Promise<DocumentRow[]> => {
  const documents = await prisma.document.findMany({
    where: { projectId },
    include: documentInclude,
  });

  const byId = new Map(documents.map((document) => [document.id, document]));
  const nextOf = new Map(
    documents.flatMap((document) =>
      document.previousVersionId ? [[document.previousVersionId, document] as const] : [],
    ),
  );

  let current = byId.get(documentId);

  while (current && nextOf.has(current.id)) {
    current = nextOf.get(current.id);
  }

  const chain: DocumentRow[] = [];

  while (current) {
    chain.push(current);
    current = current.previousVersionId ? byId.get(current.previousVersionId) : undefined;
  }

  return chain;
};

/** Devuelve `null` si la tarea no es de este proyecto. */
export const createDocument = (data: CreateDocumentData): Promise<DocumentRow | null> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, data.projectId);

    if (data.taskId) {
      const task = await tx.task.findFirst({
        where: { id: data.taskId, phase: { projectId: data.projectId } },
        select: { id: true },
      });

      if (!task) {
        return null;
      }
    }

    return tx.document.create({ data, include: documentInclude });
  });

/**
 * Una fila nueva enlazada a la anterior, que no se toca: ni ella ni su archivo.
 *
 * `previous_version_id` es único, así que una versión solo puede tener una
 * siguiente: la cadena es una línea, no un árbol. Devuelve `null` si esa versión ya
 * no es la última. La comprobación va con el bloqueo puesto, o dos subidas a la vez
 * chocarían con el índice.
 */
export const createVersion = (
  projectId: string,
  previousId: string,
  data: FileData,
): Promise<DocumentRow | null> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, projectId);

    const previous = await tx.document.findFirst({
      where: { id: previousId, projectId, nextVersion: { is: null } },
    });

    if (!previous) {
      return null;
    }

    return tx.document.create({
      data: {
        ...data,
        projectId,
        taskId: previous.taskId,
        version: previous.version + 1,
        previousVersionId: previous.id,
      },
      include: documentInclude,
    });
  });

/**
 * Borra una versión sin partir la cadena: la siguiente pasa a colgar de la anterior.
 *
 * El `SetNull` del esquema por sí solo la partiría en dos: la siguiente quedaría sin
 * anterior y la lista por defecto mostraría dos «últimas». Son tres pasos porque
 * `previous_version_id` es único: la siguiente no puede tomar el enlace mientras la
 * que se borra lo conserva.
 */
export const deleteDocument = (projectId: string, documentId: string): Promise<void> =>
  prisma.$transaction(async (tx) => {
    await lockSchedule(tx, projectId);

    const document = await tx.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { previousVersionId: true, nextVersion: { select: { id: true } } },
    });

    if (document.nextVersion) {
      await tx.document.update({
        where: { id: documentId },
        data: { previousVersionId: null },
      });
      await tx.document.update({
        where: { id: document.nextVersion.id },
        data: { previousVersionId: document.previousVersionId },
      });
    }

    await tx.document.delete({ where: { id: documentId } });
  });
