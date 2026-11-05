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

/** El otro sentido: lo que vino después del cursor, ya en orden cronológico. */
export const findMessagesAfter = (
  conversationId: string,
  after: string,
  take: number,
): Promise<MessageRow[]> =>
  prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    cursor: { id: after },
    skip: 1,
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

export const findLastReadAt = async (
  conversationId: string,
  userId: string,
): Promise<Date | null> => {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { lastReadAt: true },
  });

  return participant?.lastReadAt ?? null;
};

/** Filtra por conversación: un mensaje de otra aquí no existe. */
export const findMessageDate = async (
  conversationId: string,
  messageId: string,
): Promise<Date | null> => {
  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
    select: { createdAt: true },
  });

  return message?.createdAt ?? null;
};

/**
 * Solo avanza. Con dos pestañas, la que va atrasada mandaría un mensaje más viejo, y
 * la marca no debe retroceder.
 */
export const advanceLastRead = async (
  conversationId: string,
  userId: string,
  readAt: Date,
): Promise<void> => {
  await prisma.conversationParticipant.updateMany({
    where: {
      conversationId,
      userId,
      OR: [{ lastReadAt: null }, { lastReadAt: { lt: readAt } }],
    },
    data: { lastReadAt: readAt },
  });
};

/** Los propios no cuentan. Sin marca, cuenta todo lo ajeno. */
export const countUnread = (
  conversationId: string,
  userId: string,
  lastReadAt: Date | null,
): Promise<number> =>
  prisma.message.count({
    where: {
      conversationId,
      senderId: { not: userId },
      ...(lastReadAt && { createdAt: { gt: lastReadAt } }),
    },
  });

/**
 * El mismo conteo para una página de proyectos, en una sola consulta. En SQL porque
 * Prisma no compara una columna con la de otra tabla. Quien no participa no sale.
 */
export const countUnreadByProject = async (
  userId: string,
  projectIds: string[],
): Promise<Map<string, number>> => {
  const rows = await prisma.$queryRaw<{ project_id: string; unread: bigint }[]>`
    SELECT c.project_id, COUNT(m.id) AS unread
    FROM conversation_participants p
    JOIN conversations c ON c.id = p.conversation_id
    JOIN messages m ON m.conversation_id = c.id
      AND m.sender_id <> p.user_id
      AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
    WHERE p.user_id = ${userId}::uuid AND c.project_id = ANY(${projectIds}::uuid[])
    GROUP BY c.project_id
  `;

  return new Map(rows.map((row) => [row.project_id, Number(row.unread)]));
};
