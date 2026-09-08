import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

// Instancia única. Cada `new PrismaClient()` abre su propio pool de conexiones,
// así que el resto de la aplicación importa esta y no crea la suya.
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error', 'query'] : ['warn', 'error'],
});
