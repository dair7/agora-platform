import { Router } from 'express';
import { ProjectRole, SystemRole } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { requireProjectMember, requireProjectRole } from '../../middlewares/project-access.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './projects.controller.js';
import {
  addMemberSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  memberParamsSchema,
  projectIdParamsSchema,
  updateProjectSchema,
} from './projects.schema.js';

const router = Router();

// Ninguna ruta de proyectos es pública.
router.use(authenticate);

// El orden importa: validar el parámetro como uuid va antes de resolver el
// acceso, porque un identificador malformado llegaría hasta Prisma y saldría
// como error del servidor en vez de como petición inválida.
const withProject = [validate(projectIdParamsSchema, 'params'), requireProjectMember];
const withMemberParams = [validate(memberParamsSchema, 'params'), requireProjectMember];

// Solo el investigador principal gestiona el proyecto. El coordinador no pasa
// por aquí a propósito; lo suyo se controla con `authorize(COORDINATOR)`.
const principalInvestigatorOnly = requireProjectRole(ProjectRole.PRINCIPAL_INVESTIGATOR);

router.get('/', validate(listProjectsQuerySchema, 'query'), controller.list);
router.post(
  '/',
  authorize(SystemRole.COORDINATOR),
  validate(createProjectSchema),
  controller.create,
);

router.get('/:projectId', withProject, controller.detail);
router.patch(
  '/:projectId',
  withProject,
  principalInvestigatorOnly,
  validate(updateProjectSchema),
  controller.update,
);
router.post('/:projectId/cerrar', withProject, principalInvestigatorOnly, controller.close);

router.get('/:projectId/miembros', withProject, controller.listMembers);
router.post(
  '/:projectId/miembros',
  withProject,
  principalInvestigatorOnly,
  validate(addMemberSchema),
  controller.addMember,
);
router.delete(
  '/:projectId/miembros/:userId',
  withMemberParams,
  principalInvestigatorOnly,
  controller.removeMember,
);

export default router;
