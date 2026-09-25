import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import chatRoutes from '../modules/chat/chat.routes.js';
import projectRoutes from '../modules/projects/projects.routes.js';

// Monta todos los módulos bajo /api/v1. La ruta /salud queda fuera a propósito:
// es infraestructura, no parte de la API pública.
const router = Router();

router.use('/auth', authRoutes);
// El chat va antes que proyectos: los dos cuelgan de /proyectos y, montado
// después, cada mensaje atravesaría primero el router de proyectos, que
// autentica por su cuenta.
router.use('/proyectos/:projectId/mensajes', chatRoutes);
router.use('/proyectos', projectRoutes);

export default router;
