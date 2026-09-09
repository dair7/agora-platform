import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './auth.controller.js';
import { loginSchema, refreshTokenSchema, registerSchema } from './auth.schema.js';

const router = Router();

router.post('/registro', validate(registerSchema), controller.register);
router.post('/iniciar-sesion', validate(loginSchema), controller.login);
router.post('/refrescar', validate(refreshTokenSchema), controller.refresh);
router.post('/cerrar-sesion', validate(refreshTokenSchema), controller.logout);
router.get('/perfil', authenticate, controller.profile);

export default router;
