import { Router } from 'express';
import { ProjectRole } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireProjectMember, requireProjectRole } from '../../middlewares/project-access.js';
import { validate } from '../../middlewares/validate.js';
import { projectIdParamsSchema } from '../projects/projects.schema.js';
import * as controller from './progress.controller.js';
import {
  createProgressSchema,
  progressParamsSchema,
  updateProgressSchema,
} from './progress.schema.js';

// `mergeParams` porque el router se monta en /proyectos/:projectId/avances y sin
// él `:projectId` no llegaría hasta aquí.
const router = Router({ mergeParams: true });

router.use(authenticate);

// Mismo orden que en proyectos: el uuid se valida antes de resolver el acceso.
const withProject = [validate(projectIdParamsSchema, 'params'), requireProjectMember];
const withEntry = [validate(progressParamsSchema, 'params'), requireProjectMember];

// Cualquier miembro: reportar avance es lo que hace un equipo. La coordinación lee
// por la puerta de lectura, pero no tiene fila en project_members.
const anyMember = requireProjectRole(
  ProjectRole.PRINCIPAL_INVESTIGATOR,
  ProjectRole.CO_INVESTIGATOR,
);

router.get('/', withProject, controller.list);
router.post('/', withProject, anyMember, validate(createProgressSchema), controller.create);

// Sin `requireProjectRole`: el permiso depende del autor, así que lo decide el
// servicio.
router.patch('/:progressId', withEntry, validate(updateProgressSchema), controller.update);
router.delete('/:progressId', withEntry, controller.remove);

export default router;
