import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import chatRoutes from '../modules/chat/chat.routes.js';
import phaseRoutes from '../modules/phases/phases.routes.js';
import projectRoutes from '../modules/projects/projects.routes.js';
import taskRoutes from '../modules/tasks/tasks.routes.js';
import userRoutes from '../modules/users/users.routes.js';

// Monta todos los módulos bajo /api/v1. La ruta /salud queda fuera a propósito:
// es infraestructura, no parte de la API pública.
const router = Router();

router.use('/auth', authRoutes);
// El chat, las fases y las tareas van antes que proyectos: todos cuelgan de
// /proyectos y, montados después, cada petición atravesaría primero el router de
// proyectos, que autentica por su cuenta.
router.use('/proyectos/:projectId/mensajes', chatRoutes);
router.use('/proyectos/:projectId/fases', phaseRoutes);
router.use('/proyectos/:projectId/tareas', taskRoutes);
router.use('/proyectos', projectRoutes);
router.use('/usuarios', userRoutes);

export default router;
