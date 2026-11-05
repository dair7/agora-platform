import { Router } from 'express';
import { ProjectRole } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireProjectMember, requireProjectRole } from '../../middlewares/project-access.js';
import { validate } from '../../middlewares/validate.js';
import { projectIdParamsSchema } from '../projects/projects.schema.js';
import * as controller from './phases.controller.js';
import {
  createPhaseSchema,
  phaseParamsSchema,
  reorderPhasesSchema,
  updatePhaseSchema,
} from './phases.schema.js';

// `mergeParams` porque el router se monta en /proyectos/:projectId/fases y sin
// él `:projectId` no llegaría hasta aquí.
const router = Router({ mergeParams: true });

router.use(authenticate);

// Mismo orden que en proyectos: el uuid se valida antes de resolver el acceso.
const withProject = [validate(projectIdParamsSchema, 'params'), requireProjectMember];
const withPhase = [validate(phaseParamsSchema, 'params'), requireProjectMember];

// El cronograma lo gestiona el investigador principal. La coordinación lo lee
// por la puerta de lectura, pero no pasa por aquí.
const principalInvestigatorOnly = requireProjectRole(ProjectRole.PRINCIPAL_INVESTIGATOR);

router.get('/', withProject, controller.list);
router.post(
  '/',
  withProject,
  principalInvestigatorOnly,
  validate(createPhaseSchema),
  controller.create,
);

router.put(
  '/orden',
  withProject,
  principalInvestigatorOnly,
  validate(reorderPhasesSchema),
  controller.reorder,
);

router.patch(
  '/:phaseId',
  withPhase,
  principalInvestigatorOnly,
  validate(updatePhaseSchema),
  controller.update,
);
router.delete('/:phaseId', withPhase, principalInvestigatorOnly, controller.remove);

export default router;
