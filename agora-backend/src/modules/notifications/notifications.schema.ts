import { z } from 'zod';

export const notificationParamsSchema = z.object({
  notificationId: z.uuid('El identificador de la notificación no es válido'),
});

// Parámetros de consulta en español, como en el chat: son contrato público.
export const listNotificationsQuerySchema = z
  .object({
    limite: z.coerce
      .number('El límite debe ser un número')
      .int('El límite debe ser un entero')
      .positive('El límite debe ser un entero positivo')
      .max(100, 'El límite no puede superar 100')
      .default(50),
  })
  .transform((query) => ({ limit: query.limite }));

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type NotificationParams = z.infer<typeof notificationParamsSchema>;
