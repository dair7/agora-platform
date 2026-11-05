import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/authenticate.js';
import * as service from './users.service.js';
import type { ListUsersQuery, UpdateUserInput, UserIdParams } from './users.schema.js';

// `req.query` es un `ParsedQs` de cadenas y no se solapa con el resultado del
// esquema, que ya trae los nombres traducidos por el `transform`; de ahí que la
// conversión tenga que pasar por `unknown`.
export const list: RequestHandler = async (req, res) => {
  const users = await service.listUsers(req.query as unknown as ListUsersQuery);

  res.json({ users });
};

export const update: RequestHandler = async (req, res) => {
  const { userId } = req.params as UserIdParams;

  const user = await service.updateUser(userId, req.body as UpdateUserInput);

  res.json({ user });
};

export const deactivate: RequestHandler = async (req, res) => {
  const { userId } = req.params as UserIdParams;

  await service.deactivateUser(getAuthUser(req).id, userId);

  res.status(204).send();
};

export const reactivate: RequestHandler = async (req, res) => {
  const { userId } = req.params as UserIdParams;

  const user = await service.reactivateUser(userId);

  res.json({ user });
};
