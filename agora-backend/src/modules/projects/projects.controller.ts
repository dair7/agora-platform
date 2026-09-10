import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/authenticate.js';
import { getProjectAccess } from '../../middlewares/project-access.js';
import * as service from './projects.service.js';
import type {
  AddMemberInput,
  CreateProjectInput,
  ListProjectsQuery,
  MemberParams,
  UpdateProjectInput,
} from './projects.schema.js';

// Las aserciones sobre `req.body` y `req.query` son seguras porque `validate`
// ya sustituyó ambos por el resultado del esquema.
// `req.query` es un `ParsedQs` de cadenas y no se solapa con el resultado del
// esquema, que ya trae números y los nombres traducidos al inglés por el
// `transform`; de ahí que la conversión tenga que pasar por `unknown`.
export const list: RequestHandler = async (req, res) => {
  const page = await service.listProjects(
    getAuthUser(req),
    req.query as unknown as ListProjectsQuery,
  );

  res.json(page);
};

export const create: RequestHandler = async (req, res) => {
  const project = await service.createProject(getAuthUser(req).id, req.body as CreateProjectInput);

  res.status(201).json({ project });
};

export const detail: RequestHandler = async (req, res) => {
  const project = await service.getProject(getProjectAccess(req).project.id);

  res.json({ project });
};

export const update: RequestHandler = async (req, res) => {
  const project = await service.updateProject(
    getProjectAccess(req),
    req.body as UpdateProjectInput,
  );

  res.json({ project });
};

export const close: RequestHandler = async (req, res) => {
  const project = await service.closeProject(getProjectAccess(req));

  res.json({ project });
};

export const listMembers: RequestHandler = async (req, res) => {
  const members = await service.listMembers(getProjectAccess(req).project.id);

  res.json({ members });
};

export const addMember: RequestHandler = async (req, res) => {
  const members = await service.addMember(getProjectAccess(req), req.body as AddMemberInput);

  res.status(201).json({ members });
};

export const removeMember: RequestHandler = async (req, res) => {
  const { userId } = req.params as MemberParams;

  await service.removeMember(getProjectAccess(req), userId);

  res.status(204).send();
};
