import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

// Selección explícita del remitente: nunca `include: { sender: true }`, que
// arrastra `password_hash` hasta la respuesta y hasta el evento.
const messageSelect = {
  id: true,
  content: true,
  createdAt: true,
  sender: { select: { id: true, fullName: true } },
} satisfies Prisma.MessageSelect;

export type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

/**
 * La conversación del proyecto, pero solo si la persona participa en ella. El
 * id de la conversación sale de aquí y nunca del cliente: así nadie escribe en
 * una conversación ajena cambiando un número.
 */
export const findProjectConversationId = async (
  projectId: string,
  userId: string,
): Promise<string | null> => {
  const participation = await prisma.conversationParticipant.findFirst({
    where: { userId, conversation: { projectId } },
    select: { conversationId: true },
  });

  return participation?.conversationId ?? null;
};

/**
 * Del más reciente hacia atrás, porque el cursor apunta al pasado. Se pide uno
 * de más para saber si queda historial sin otra consulta.
 *
 * El `id` desempata mensajes con el mismo `created_at`: sin él, el orden entre
 * ellos no está definido y el cursor podría saltarse o repetir uno.
 */
export const findMessages = (
  conversationId: string,
  before: string | undefined,
  take: number,
): Promise<MessageRow[]> =>
  prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(before && { cursor: { id: before }, skip: 1 }),
    take,
    select: messageSelect,
  });

export const createMessage = (
  conversationId: string,
  senderId: string,
  content: string,
): Promise<MessageRow> =>
  prisma.message.create({
    data: { conversationId, senderId, content },
    select: messageSelect,
  });
