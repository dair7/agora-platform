import type { RequestHandler } from 'express';
import * as service from './users.service.js';
import type { ListUsersQuery } from './users.schema.js';

// `req.query` es un `ParsedQs` de cadenas y no se solapa con el resultado del
// esquema, que ya trae los nombres traducidos por el `transform`; de ahí que la
// conversión tenga que pasar por `unknown`.
export const list: RequestHandler = async (req, res) => {
  const users = await service.listUsers(req.query as unknown as ListUsersQuery);

  res.json({ users });
};
