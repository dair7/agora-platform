import type { RequestHandler } from 'express';
import { getProjectAccess } from '../../middlewares/project-access.js';
import * as service from './phases.service.js';
import type {
  CreatePhaseInput,
  PhaseParams,
  ReorderPhasesInput,
  UpdatePhaseInput,
} from './phases.schema.js';

export const list: RequestHandler = async (req, res) => {
  const phases = await service.listPhases(getProjectAccess(req).project.id);

  res.json({ phases });
};

export const create: RequestHandler = async (req, res) => {
  const phase = await service.createPhase(getProjectAccess(req), req.body as CreatePhaseInput);

  res.status(201).json({ phase });
};

export const update: RequestHandler = async (req, res) => {
  const { phaseId } = req.params as PhaseParams;

  const phase = await service.updatePhase(
    getProjectAccess(req),
    phaseId,
    req.body as UpdatePhaseInput,
  );

  res.json({ phase });
};

export const remove: RequestHandler = async (req, res) => {
  const { phaseId } = req.params as PhaseParams;

  await service.deletePhase(getProjectAccess(req), phaseId);

  res.status(204).send();
};

export const reorder: RequestHandler = async (req, res) => {
  const phases = await service.reorderPhases(getProjectAccess(req), req.body as ReorderPhasesInput);

  res.json({ phases });
};
