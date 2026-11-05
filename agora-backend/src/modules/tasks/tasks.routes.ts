import { Router } from 'express';
import { ProjectRole } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireProjectMember, requireProjectRole } from '../../middlewares/project-access.js';
import { validate } from '../../middlewares/validate.js';
import { projectIdParamsSchema } from '../projects/projects.schema.js';
import * as controller from './tasks.controller.js';
import {
  addDependencySchema,
  createTaskSchema,
  dependencyParamsSchema,
  taskParamsSchema,
  updateTaskSchema,
} from './tasks.schema.js';

// `mergeParams` porque el router se monta en /proyectos/:projectId/tareas y sin
// él `:projectId` no llegaría hasta aquí.
const router = Router({ mergeParams: true });

router.use(authenticate);

// Mismo orden que en proyectos: el uuid se valida antes de resolver el acceso.
const withProject = [validate(projectIdParamsSchema, 'params'), requireProjectMember];
const withTask = [validate(taskParamsSchema, 'params'), requireProjectMember];
const withDependency = [validate(dependencyParamsSchema, 'params'), requireProjectMember];

// La coordinación lee por la puerta de lectura, pero no pasa por aquí.
const principalInvestigatorOnly = requireProjectRole(ProjectRole.PRINCIPAL_INVESTIGATOR);

router.get('/', withProject, controller.list);
router.post(
  '/',
  withProject,
  principalInvestigatorOnly,
  validate(createTaskSchema),
  controller.create,
);

// Sin `requireProjectRole`, y es la única escritura que no lo lleva: quien tiene
// la tarea asignada también entra. El permiso depende de la tarea y del cuerpo,
// así que lo decide el servicio.
router.patch('/:taskId', withTask, validate(updateTaskSchema), controller.update);
router.delete('/:taskId', withTask, principalInvestigatorOnly, controller.remove);

router.post(
  '/:taskId/dependencias',
  withTask,
  principalInvestigatorOnly,
  validate(addDependencySchema),
  controller.addDependency,
);
router.delete(
  '/:taskId/dependencias/:dependsOnId',
  withDependency,
  principalInvestigatorOnly,
  controller.removeDependency,
);

export default router;
