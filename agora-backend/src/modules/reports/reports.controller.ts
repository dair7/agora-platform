import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/authenticate.js';
import { getProjectAccess } from '../../middlewares/project-access.js';
import * as service from './reports.service.js';
import type { ListMyTasksQuery, ListProjectFiguresQuery } from './reports.schema.js';

export const summary: RequestHandler = async (req, res) => {
  res.json({ summary: await service.getSummary(getAuthUser(req)) });
};

// `req.query` es un `ParsedQs` de cadenas y no se solapa con el resultado del esquema, que
// ya trae los nombres traducidos; de ahí que la conversión pase por `unknown`.
export const projects: RequestHandler = async (req, res) => {
  res.json(
    await service.listProjectFigures(
      getAuthUser(req),
      req.query as unknown as ListProjectFiguresQuery,
    ),
  );
};

export const projectFigures: RequestHandler = async (req, res) => {
  const { project } = getProjectAccess(req);

  res.json({ figures: await service.getProjectFigures(project.id) });
};

export const myTasks: RequestHandler = async (req, res) => {
  res.json(await service.listMyTasks(getAuthUser(req), req.query as unknown as ListMyTasksQuery));
};
