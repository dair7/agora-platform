import { Router } from 'express';
import { ProjectRole } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireProjectMember, requireProjectRole } from '../../middlewares/project-access.js';
import { uploadFile } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import { projectIdParamsSchema } from '../projects/projects.schema.js';
import * as controller from './documents.controller.js';
import {
  documentParamsSchema,
  uploadDocumentSchema,
  uploadVersionSchema,
} from './documents.schema.js';

// `mergeParams` porque el router se monta en /proyectos/:projectId/documentos y sin
// él `:projectId` no llegaría hasta aquí.
const router = Router({ mergeParams: true });

router.use(authenticate);

// Mismo orden que en proyectos: el uuid se valida antes de resolver el acceso.
const withProject = [validate(projectIdParamsSchema, 'params'), requireProjectMember];
const withDocument = [validate(documentParamsSchema, 'params'), requireProjectMember];

// Cualquier miembro sube. La coordinación lee y descarga por la puerta de lectura,
// pero no tiene fila en project_members. `uploadFile` va después de esta puerta.
const anyMember = requireProjectRole(
  ProjectRole.PRINCIPAL_INVESTIGATOR,
  ProjectRole.CO_INVESTIGATOR,
);

router.get('/', withProject, controller.list);
router.post(
  '/',
  withProject,
  anyMember,
  uploadFile,
  validate(uploadDocumentSchema),
  controller.upload,
);

router.get('/:documentId/versiones', withDocument, controller.listVersions);
router.post(
  '/:documentId/versiones',
  withDocument,
  anyMember,
  uploadFile,
  validate(uploadVersionSchema),
  controller.uploadVersion,
);

router.get('/:documentId/descarga', withDocument, controller.download);

// Sin `requireProjectRole`: el permiso depende de quién lo subió, así que lo decide
// el servicio.
router.delete('/:documentId', withDocument, controller.remove);

export default router;
