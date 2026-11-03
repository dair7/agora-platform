import { z } from 'zod';
import { SystemRole } from '@prisma/client';

// Los parámetros de consulta van en español, como en la lista de proyectos, y el
// `transform` los traduce al inglés del código interno.
//
// A diferencia de la lista de proyectos, `buscar` vacío no es un error: se trata
// como si no viniera. Un buscador recién abierto está vacío, y responderle 400
// obliga a cada cliente a recordar que no debe mandarlo.
export const listUsersQuerySchema = z
  .object({
    rol: z.enum(SystemRole).optional(),
    buscar: z
      .string()
      .trim()
      .max(200, 'El texto de búsqueda no puede superar 200 caracteres')
      .optional(),
  })
  .transform((query) => ({
    role: query.rol,
    search: query.buscar || undefined,
  }));

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
