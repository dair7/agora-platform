import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/authenticate.js';
import { getProjectAccess } from '../../middlewares/project-access.js';
import * as service from './chat.service.js';
import type { ListMessagesQuery, SendMessageInput } from './chat.schema.js';

// Las aserciones son seguras porque `validate` ya sustituyó `req.query` y
// `req.body`. La de `req.query` pasa por `unknown` por lo mismo que en
// proyectos: el esquema traduce los nombres y convierte el límite a número.
export const list: RequestHandler = async (req, res) => {
  const page = await service.listMessages(
    getProjectAccess(req),
    getAuthUser(req).id,
    req.query as unknown as ListMessagesQuery,
  );

  res.json(page);
};

export const send: RequestHandler = async (req, res) => {
  const message = await service.sendMessage(
    getProjectAccess(req),
    getAuthUser(req).id,
    req.body as SendMessageInput,
  );

  res.status(201).json({ message });
};
