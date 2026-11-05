import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './notifications.controller.js';
import { listNotificationsQuerySchema, notificationParamsSchema } from './notifications.schema.js';

const router = Router();

// Sin puerta de rol: cada persona ve solo las suyas, también la coordinación. El
// filtro está en las consultas.
router.use(authenticate);

router.get('/', validate(listNotificationsQuerySchema, 'query'), controller.list);
router.post('/leidas', controller.markAllRead);
router.post(
  '/:notificationId/leida',
  validate(notificationParamsSchema, 'params'),
  controller.markRead,
);

export default router;
