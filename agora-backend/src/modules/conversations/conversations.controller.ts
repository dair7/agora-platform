import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/authenticate.js';
import type { ListMessagesQuery, MarkReadInput, SendMessageInput } from '../chat/chat.schema.js';
import * as service from './conversations.service.js';
import type { ConversationParams, OpenConversationInput } from './conversations.schema.js';

export const contacts: RequestHandler = async (req, res) => {
  res.json({ contacts: await service.listContacts(getAuthUser(req)) });
};

export const list: RequestHandler = async (req, res) => {
  res.json({ conversations: await service.listConversations(getAuthUser(req).id) });
};

/** `201` si se acaba de crear y `200` si ya existía: las dos dan la misma conversación. */
export const open: RequestHandler = async (req, res) => {
  const { conversation, created } = await service.openConversation(
    getAuthUser(req),
    req.body as OpenConversationInput,
  );

  res.status(created ? 201 : 200).json({ conversation });
};

export const detail: RequestHandler = async (req, res) => {
  const { conversationId } = req.params as ConversationParams;

  res.json({ conversation: await service.getConversation(getAuthUser(req).id, conversationId) });
};

// La aserción de `req.query` pasa por `unknown` por lo mismo que en el chat de proyecto: el
// esquema traduce los nombres y convierte el límite a número.
export const listMessages: RequestHandler = async (req, res) => {
  const { conversationId } = req.params as ConversationParams;

  res.json(
    await service.listMessages(
      getAuthUser(req).id,
      conversationId,
      req.query as unknown as ListMessagesQuery,
    ),
  );
};

export const sendMessage: RequestHandler = async (req, res) => {
  const { conversationId } = req.params as ConversationParams;
  const message = await service.sendMessage(
    getAuthUser(req).id,
    conversationId,
    req.body as SendMessageInput,
  );

  res.status(201).json({ message });
};

export const readState: RequestHandler = async (req, res) => {
  const { conversationId } = req.params as ConversationParams;

  res.json(await service.getReadState(getAuthUser(req).id, conversationId));
};

export const markRead: RequestHandler = async (req, res) => {
  const { conversationId } = req.params as ConversationParams;

  res.json(await service.markRead(getAuthUser(req).id, conversationId, req.body as MarkReadInput));
};
