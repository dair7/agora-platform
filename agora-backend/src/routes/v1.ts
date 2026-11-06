import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import chatRoutes from '../modules/chat/chat.routes.js';
import conversationRoutes from '../modules/conversations/conversations.routes.js';
import documentRoutes from '../modules/documents/documents.routes.js';
import notificationRoutes from '../modules/notifications/notifications.routes.js';
import phaseRoutes from '../modules/phases/phases.routes.js';
import progressRoutes from '../modules/progress/progress.routes.js';
import projectRoutes from '../modules/projects/projects.routes.js';
import {
  globalReportRoutes,
  myTaskRoutes,
  projectFigureRoutes,
} from '../modules/reports/reports.routes.js';
import taskRoutes from '../modules/tasks/tasks.routes.js';
import userRoutes from '../modules/users/users.routes.js';

// Monta todos los módulos bajo /api/v1. La ruta /salud queda fuera a propósito:
// es infraestructura, no parte de la API pública.
const router = Router();

router.use('/auth', authRoutes);
// Lo que cuelga de un proyecto va antes que proyectos: montado después, cada
// petición atravesaría primero el router de proyectos, que autentica por su cuenta.
router.use('/proyectos/:projectId/mensajes', chatRoutes);
router.use('/proyectos/:projectId/fases', phaseRoutes);
router.use('/proyectos/:projectId/tareas', taskRoutes);
router.use('/proyectos/:projectId/avances', progressRoutes);
router.use('/proyectos/:projectId/documentos', documentRoutes);
router.use('/proyectos/:projectId/cifras', projectFigureRoutes);
router.use('/proyectos', projectRoutes);
router.use('/usuarios', userRoutes);
router.use('/notificaciones', notificationRoutes);
router.use('/conversaciones', conversationRoutes);
router.use('/reportes', globalReportRoutes);
router.use('/mis-tareas', myTaskRoutes);

export default router;
