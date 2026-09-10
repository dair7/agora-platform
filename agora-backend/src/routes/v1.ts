import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import projectRoutes from '../modules/projects/projects.routes.js';

// Monta todos los módulos bajo /api/v1. La ruta /salud queda fuera a propósito:
// es infraestructura, no parte de la API pública.
const router = Router();

router.use('/auth', authRoutes);
router.use('/proyectos', projectRoutes);

export default router;
