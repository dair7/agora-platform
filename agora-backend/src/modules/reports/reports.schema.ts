import { z } from 'zod';

// Parámetros de consulta en español: son contrato público. La respuesta y el código,
// en inglés, como en la lista de proyectos.
export const listProjectFiguresQuerySchema = z
  .object({
    pagina: z.coerce
      .number('La página debe ser un número')
      .int('La página debe ser un entero')
      .positive('La página debe ser un entero positivo')
      .default(1),
    porPagina: z.coerce
      .number('El tamaño de página debe ser un número')
      .int('El tamaño de página debe ser un entero')
      .positive('El tamaño de página debe ser un entero positivo')
      .max(100, 'El tamaño de página no puede superar 100')
      .default(20),
  })
  .transform((query) => ({ page: query.pagina, perPage: query.porPagina }));

export const listMyTasksQuerySchema = z
  .object({
    limite: z.coerce
      .number('El límite debe ser un número')
      .int('El límite debe ser un entero')
      .positive('El límite debe ser un entero positivo')
      .max(100, 'El límite no puede superar 100')
      .default(50),
  })
  .transform((query) => ({ limit: query.limite }));

export type ListProjectFiguresQuery = z.infer<typeof listProjectFiguresQuerySchema>;
export type ListMyTasksQuery = z.infer<typeof listMyTasksQuerySchema>;
