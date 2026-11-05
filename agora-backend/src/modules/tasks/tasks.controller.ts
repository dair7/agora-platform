import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/authenticate.js';
import { getProjectAccess } from '../../middlewares/project-access.js';
import * as service from './tasks.service.js';
import type {
  AddDependencyInput,
  CreateTaskInput,
  DependencyParams,
  TaskParams,
  UpdateTaskInput,
} from './tasks.schema.js';

export const list: RequestHandler = async (req, res) => {
  const tasks = await service.listTasks(getProjectAccess(req).project.id);

  res.json({ tasks });
};

export const create: RequestHandler = async (req, res) => {
  const task = await service.createTask(
    getProjectAccess(req),
    getAuthUser(req).id,
    req.body as CreateTaskInput,
  );

  res.status(201).json({ task });
};

export const update: RequestHandler = async (req, res) => {
  const { taskId } = req.params as TaskParams;

  const task = await service.updateTask(
    getProjectAccess(req),
    getAuthUser(req).id,
    taskId,
    req.body as UpdateTaskInput,
  );

  res.json({ task });
};

export const remove: RequestHandler = async (req, res) => {
  const { taskId } = req.params as TaskParams;

  await service.deleteTask(getProjectAccess(req), taskId);

  res.status(204).send();
};

export const addDependency: RequestHandler = async (req, res) => {
  const { taskId } = req.params as TaskParams;
  const { dependsOnTaskId } = req.body as AddDependencyInput;

  const task = await service.addDependency(getProjectAccess(req), taskId, dependsOnTaskId);

  res.status(201).json({ task });
};

export const removeDependency: RequestHandler = async (req, res) => {
  const { taskId, dependsOnId } = req.params as DependencyParams;

  await service.removeDependency(getProjectAccess(req), taskId, dependsOnId);

  res.status(204).send();
};
