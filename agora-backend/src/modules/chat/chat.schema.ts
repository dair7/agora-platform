import { z } from 'zod';

// Parámetros de consulta en español, como en proyectos: son contrato público.
// El `transform` los traduce al inglés del código interno.
//
// Paginación por cursor y no por página: en un chat llegan mensajes mientras se
// lee el historial, y con `pagina` cada mensaje nuevo desplazaría los bloques y
// repetiría uno al pedir el siguiente. `antes` es el id del mensaje más antiguo
// que el cliente ya tiene.
export const listMessagesQuerySchema = z
  .object({
    antes: z.uuid('El cursor debe ser el identificador de un mensaje').optional(),
    limite: z.coerce
      .number()
      .int()
      .positive('El límite debe ser un entero positivo')
      .max(100, 'El límite no puede superar 100')
      .default(50),
  })
  .transform((query) => ({
    before: query.antes,
    limit: query.limite,
  }));

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'El mensaje no puede estar vacío')
    .max(2000, 'El mensaje no puede superar 2000 caracteres'),
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
