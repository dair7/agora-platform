import type { AuthUser } from '../../middlewares/authenticate.js';
import { AppError } from '../../middlewares/error-handler.js';
import { emitToUser } from '../../sockets/emitter.js';
import type { ChatMessagePayload } from '../../sockets/events.js';
import * as messages from '../chat/chat.repository.js';
import type { ListMessagesQuery, MarkReadInput, SendMessageInput } from '../chat/chat.schema.js';
import { markReadIn, pageOf, readStateOf, toChatMessage } from '../chat/chat.service.js';
import type { MessagePage, ReadState } from '../chat/chat.service.js';
import * as repository from './conversations.repository.js';
import type { Contact, SummaryRow } from './conversations.repository.js';
import type { OpenConversationInput } from './conversations.schema.js';

export interface ConversationSummary {
  id: string;
  otherUser: { id: string; fullName: string; isActive: boolean };
  /** `null` en una conversación abierta en la que nadie ha escrito. */
  lastMessage: { id: string; content: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
}

const toSummary = (row: SummaryRow): ConversationSummary => ({
  id: row.id,
  otherUser: { id: row.other_id, fullName: row.other_name, isActive: row.other_active },
  lastMessage:
    row.last_id && row.last_content !== null && row.last_at && row.last_sender_id
      ? {
          id: row.last_id,
          content: row.last_content,
          createdAt: row.last_at.toISOString(),
          senderId: row.last_sender_id,
        }
      : null,
  unreadCount: row.unread,
});

const NOT_FOUND = 'La conversación no existe';

/**
 * Quien no participa recibe `404`, no `403`, como con un proyecto ajeno: un `403` confirmaría
 * que ese identificador es una conversación real. La coordinación no es una excepción: una
 * conversación privada es de sus dos personas, y ver todos los proyectos no da para esto.
 */
const participantsOf = async (conversationId: string, userId: string) => {
  const participants = await repository.findParticipants(conversationId, userId);

  if (!participants) {
    throw new AppError(404, 'NOT_FOUND', NOT_FOUND);
  }

  return participants;
};

export const listContacts = (user: AuthUser): Promise<Contact[]> => repository.findContacts(user);

export const listConversations = async (userId: string): Promise<ConversationSummary[]> =>
  (await repository.findSummaries(userId)).map(toSummary);

export const getConversation = async (
  userId: string,
  conversationId: string,
): Promise<ConversationSummary> => {
  const row = await repository.findSummary(userId, conversationId);

  if (!row) {
    throw new AppError(404, 'NOT_FOUND', NOT_FOUND);
  }

  return toSummary(row);
};

/** `404` y no `403` a quien no se puede contactar: un `403` confirmaría que la cuenta existe. */
export const openConversation = async (
  user: AuthUser,
  { userId }: OpenConversationInput,
): Promise<{ conversation: ConversationSummary; created: boolean }> => {
  if (userId === user.id) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
      { field: 'userId', message: 'No se puede abrir una conversación con uno mismo' },
    ]);
  }

  const opened = await repository.openPrivateConversation(user, userId);

  if (!opened) {
    throw new AppError(404, 'NOT_FOUND', 'La persona no existe');
  }

  return {
    conversation: await getConversation(user.id, opened.id),
    created: opened.created,
  };
};

export const listMessages = async (
  userId: string,
  conversationId: string,
  query: ListMessagesQuery,
): Promise<MessagePage> => {
  await participantsOf(conversationId, userId);

  return pageOf(conversationId, query, (row) => toChatMessage(conversationId, row));
};

export const sendMessage = async (
  userId: string,
  conversationId: string,
  input: SendMessageInput,
): Promise<ChatMessagePayload> => {
  const participants = await participantsOf(conversationId, userId);

  // Se lee el historial, pero no se escribe a quien ya no va a contestar.
  if (participants.some(({ id, isActive }) => id !== userId && !isActive)) {
    throw new AppError(409, 'CONFLICT', 'La otra cuenta está desactivada');
  }

  const row = await messages.createMessage(conversationId, userId, input.content);
  const message = toChatMessage(conversationId, row);

  // Después de persistir. A los dos, remitente incluido: sus otras pestañas también lo
  // necesitan, y la que envió lo descarta por id.
  for (const { id } of participants) {
    emitToUser(id, 'chat:mensaje', message);
  }

  return message;
};

export const getReadState = async (userId: string, conversationId: string): Promise<ReadState> => {
  await participantsOf(conversationId, userId);

  return readStateOf(conversationId, userId);
};

export const markRead = async (
  userId: string,
  conversationId: string,
  input: MarkReadInput,
): Promise<ReadState> => {
  await participantsOf(conversationId, userId);

  return markReadIn(conversationId, userId, input);
};
