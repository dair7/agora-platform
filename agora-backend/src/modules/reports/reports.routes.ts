import { Router } from 'express';
import { SystemRole } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { requireProjectMember } from '../../middlewares/project-access.js';
import { validate } from '../../middlewares/validate.js';
import { projectIdParamsSchema } from '../projects/projects.schema.js';
import * as controller from './reports.controller.js';
import { listMyTasksQuerySchema, listProjectFiguresQuerySchema } from './reports.schema.js';

/** Las cifras globales: solo la coordinación, que es quien ve todos los proyectos. */
export const globalReportRoutes = Router();

globalReportRoutes.use(authenticate, authorize(SystemRole.COORDINATOR));
globalReportRoutes.get('/resumen', controller.summary);
globalReportRoutes.get(
  '/proyectos',
  validate(listProjectFiguresQuerySchema, 'query'),
  controller.projects,
);

/** Lo pendiente de quien pregunta. La coordinación no tiene tareas: no es miembro de nada. */
export const myTaskRoutes = Router();

myTaskRoutes.use(authenticate, authorize(SystemRole.RESEARCHER));
myTaskRoutes.get('/', validate(listMyTasksQuerySchema, 'query'), controller.myTasks);

/**
 * Las cifras de un proyecto. Es lectura: la coordinación pasa, y quien no es miembro recibe
 * `404`, porque para él el proyecto no existe. `mergeParams` por `:projectId`.
 */
export const projectFigureRoutes = Router({ mergeParams: true });

projectFigureRoutes.use(authenticate);
projectFigureRoutes.get(
  '/',
  validate(projectIdParamsSchema, 'params'),
  requireProjectMember,
  controller.projectFigures,
);
