import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/authenticate.js';
import { getProjectAccess } from '../../middlewares/project-access.js';
import { getUploadedFile } from '../../middlewares/upload.js';
import * as service from './documents.service.js';
import type { DocumentParams, UploadDocumentInput } from './documents.schema.js';

/**
 * El nombre original, según RFC 5987. No se usa `res.attachment()`: con un nombre
 * que cabe en latin1, como «acción.pdf», omite `filename*` y manda los bytes crudos,
 * y el acento llega roto.
 */
const attachmentHeader = (name: string): string => {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
};

export const list: RequestHandler = async (req, res) => {
  const documents = await service.listDocuments(getProjectAccess(req).project.id);

  res.json({ documents });
};

export const listVersions: RequestHandler = async (req, res) => {
  const { documentId } = req.params as DocumentParams;

  const documents = await service.listVersions(getProjectAccess(req).project.id, documentId);

  res.json({ documents });
};

export const download: RequestHandler = async (req, res) => {
  const { documentId } = req.params as DocumentParams;

  const file = await service.downloadDocument(getProjectAccess(req).project.id, documentId);

  // El tipo lo declaró quien subió el archivo: `nosniff` y `attachment` evitan que
  // el navegador lo interprete en nuestro origen.
  res.set('Content-Disposition', attachmentHeader(file.name));
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(file.mimeType);
  res.send(file.content);
};

export const upload: RequestHandler = async (req, res) => {
  const document = await service.uploadDocument(
    getProjectAccess(req),
    getAuthUser(req).id,
    getUploadedFile(req),
    req.body as UploadDocumentInput,
  );

  res.status(201).json({ document });
};

export const uploadVersion: RequestHandler = async (req, res) => {
  const { documentId } = req.params as DocumentParams;

  const document = await service.uploadVersion(
    getProjectAccess(req),
    getAuthUser(req).id,
    documentId,
    getUploadedFile(req),
  );

  res.status(201).json({ document });
};

export const remove: RequestHandler = async (req, res) => {
  const { documentId } = req.params as DocumentParams;

  await service.deleteDocument(getProjectAccess(req), getAuthUser(req).id, documentId);

  res.status(204).send();
};
