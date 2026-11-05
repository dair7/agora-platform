import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/authenticate.js';
import { getProjectAccess } from '../../middlewares/project-access.js';
import * as service from './progress.service.js';
import type {
  CreateProgressInput,
  ProgressParams,
  UpdateProgressInput,
} from './progress.schema.js';

export const list: RequestHandler = async (req, res) => {
  const progress = await service.listProgress(getProjectAccess(req).project.id);

  res.json({ progress });
};

export const create: RequestHandler = async (req, res) => {
  const progress = await service.createProgress(
    getProjectAccess(req),
    getAuthUser(req).id,
    req.body as CreateProgressInput,
  );

  res.status(201).json({ progress });
};

export const update: RequestHandler = async (req, res) => {
  const { progressId } = req.params as ProgressParams;

  const progress = await service.updateProgress(
    getProjectAccess(req),
    getAuthUser(req).id,
    progressId,
    req.body as UpdateProgressInput,
  );

  res.json({ progress });
};

export const remove: RequestHandler = async (req, res) => {
  const { progressId } = req.params as ProgressParams;

  await service.deleteProgress(getProjectAccess(req), getAuthUser(req).id, progressId);

  res.status(204).send();
};
