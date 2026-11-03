import { Router } from 'express';
import { SystemRole } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './users.controller.js';
import { listUsersQuerySchema } from './users.schema.js';

const router = Router();

// Solo la coordinación: es quien nombra al investigador principal al crear un
// proyecto. El investigador principal invita por correo, no por uuid, así que no
// necesita la lista; y que cualquiera pudiera enumerar a todas las personas del
// sistema iría contra el espíritu de la regla de oro.
router.use(authenticate, authorize(SystemRole.COORDINATOR));

router.get('/', validate(listUsersQuerySchema, 'query'), controller.list);

export default router;
