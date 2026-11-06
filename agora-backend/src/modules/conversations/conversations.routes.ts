import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { listMessagesQuerySchema, markReadSchema, sendMessageSchema } from '../chat/chat.schema.js';
import * as controller from './conversations.controller.js';
import { conversationParamsSchema, openConversationSchema } from './conversations.schema.js';

const router = Router();

// Sin puerta de rol: cada persona ve solo lo suyo, también la coordinación. La fila de
// participante la comprueba el servicio, en cada ruta.
router.use(authenticate);

const withConversation = validate(conversationParamsSchema, 'params');

router.get('/', controller.list);
router.post('/', validate(openConversationSchema), controller.open);
// Antes de `/:conversationId`, o «contactos» se leería como un identificador.
router.get('/contactos', controller.contacts);

router.get('/:conversationId', withConversation, controller.detail);
router.get(
  '/:conversationId/mensajes',
  withConversation,
  validate(listMessagesQuerySchema, 'query'),
  controller.listMessages,
);
router.post(
  '/:conversationId/mensajes',
  withConversation,
  validate(sendMessageSchema),
  controller.sendMessage,
);
router.get('/:conversationId/mensajes/lectura', withConversation, controller.readState);
router.put(
  '/:conversationId/mensajes/lectura',
  withConversation,
  validate(markReadSchema),
  controller.markRead,
);

export default router;
