import { z } from 'zod';

export const conversationParamsSchema = z.object({
  conversationId: z.uuid('El identificador de la conversación no es válido'),
});

// `strictObject`: el cuerpo dice con quién, y nada más.
export const openConversationSchema = z.strictObject(
  { userId: z.uuid('El identificador de la persona no es válido') },
  'El cuerpo debe ser un objeto JSON con userId',
);

export type ConversationParams = z.infer<typeof conversationParamsSchema>;
export type OpenConversationInput = z.infer<typeof openConversationSchema>;
