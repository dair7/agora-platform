import { PrismaClient } from '@prisma/client';

// Instancia única. Cada `new PrismaClient()` abre su propio pool de conexiones,
// así que el resto de la aplicación importa esta y no crea la suya.
//
// Sin `query`: en desarrollo imprimía cada consulta y tapaba los logs útiles.
export const prisma = new PrismaClient({
  log: ['warn', 'error'],
});
