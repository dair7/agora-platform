import { Router } from 'express';
import { SystemRole } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './auth.controller.js';
import { loginSchema, refreshTokenSchema, registerSchema } from './auth.schema.js';

const router = Router();

// No hay registro público: las cuentas las crea la coordinación. Una cuenta sin
// membresías no vería nada, pero el registro abierto deja que cualquiera en
// internet cree una, y en una plataforma institucional decide quién entra.
router.post(
  '/registro',
  authenticate,
  authorize(SystemRole.COORDINATOR),
  validate(registerSchema),
  controller.register,
);
router.post('/iniciar-sesion', validate(loginSchema), controller.login);
router.post('/refrescar', validate(refreshTokenSchema), controller.refresh);
router.post('/cerrar-sesion', validate(refreshTokenSchema), controller.logout);
router.get('/perfil', authenticate, controller.profile);

export default router;
