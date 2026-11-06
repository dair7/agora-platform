import { Router } from 'express';
import { SystemRole } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './users.controller.js';
import {
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
  userIdParamsSchema,
} from './users.schema.js';

const router = Router();

// Solo la coordinación: es quien nombra al investigador principal al crear un
// proyecto y quien gestiona las cuentas. El investigador principal invita por
// correo, no por uuid, así que no necesita la lista; y que cualquiera pudiera
// enumerar a todas las personas del sistema iría contra el espíritu de la regla
// de oro.
router.use(authenticate, authorize(SystemRole.COORDINATOR));

const withUser = validate(userIdParamsSchema, 'params');

router.get('/', validate(listUsersQuerySchema, 'query'), controller.list);
router.patch('/:userId', withUser, validate(updateUserSchema), controller.update);
router.delete('/:userId', withUser, controller.deactivate);
router.post('/:userId/reactivar', withUser, controller.reactivate);
router.post(
  '/:userId/restablecer-contrasena',
  withUser,
  validate(resetPasswordSchema),
  controller.resetPassword,
);

export default router;
