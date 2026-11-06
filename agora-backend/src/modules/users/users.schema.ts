import { z } from 'zod';
import { SystemRole } from '@prisma/client';
import { passwordSchema } from '../auth/auth.schema.js';

export const userIdParamsSchema = z.object({
  userId: z.uuid('El identificador del usuario no es válido'),
});

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
    incluirInactivas: z
      .enum(['true', 'false'], 'incluirInactivas debe ser true o false')
      .optional(),
  })
  .transform((query) => ({
    role: query.rol,
    search: query.buscar || undefined,
    includeInactive: query.incluirInactivas === 'true',
  }));

// Solo el nombre, y lo demás responde 400 en vez de desaparecer en silencio. El
// rol no: que una coordinación no pueda fabricar otra no se toca por una puerta
// lateral. El correo no: es la identidad con la que se entra. `isActive` no: para
// eso están la baja y `POST /reactivar`.
export const updateUserSchema = z.strictObject(
  {
    fullName: z
      .string('El nombre es obligatorio')
      .trim()
      .min(3, 'El nombre debe tener al menos 3 caracteres')
      .max(150, 'El nombre no puede superar 150 caracteres'),
  },
  'De una cuenta solo se puede cambiar el nombre: el cuerpo debe ser { fullName }',
);

// Las mismas reglas que el registro, y solo la contraseña: lo demás responde 400 en
// vez de desaparecer en silencio. El mensaje de una clave de más nombra la clave, nunca
// su valor.
export const resetPasswordSchema = z.strictObject(
  { password: passwordSchema },
  'El cuerpo debe ser { password }',
);

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UserIdParams = z.infer<typeof userIdParamsSchema>;
