import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireProjectMember } from '../../middlewares/project-access.js';
import { validate } from '../../middlewares/validate.js';
import { projectIdParamsSchema } from '../projects/projects.schema.js';
import * as controller from './chat.controller.js';
import { listMessagesQuerySchema, sendMessageSchema } from './chat.schema.js';

// `mergeParams` porque el router se monta en /proyectos/:projectId/mensajes y
// sin él `:projectId` no llegaría hasta aquí.
const router = Router({ mergeParams: true });

router.use(authenticate);

// Mismo orden que en proyectos: el uuid se valida antes de resolver el acceso.
// La puerta es la de lectura; que sea participante lo decide el servicio.
const withProject = [validate(projectIdParamsSchema, 'params'), requireProjectMember];

router.get('/', withProject, validate(listMessagesQuerySchema, 'query'), controller.list);
router.post('/', withProject, validate(sendMessageSchema), controller.send);

export default router;
