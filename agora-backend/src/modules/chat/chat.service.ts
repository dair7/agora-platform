import { ProjectStatus } from '@prisma/client';
import { AppError } from '../../middlewares/error-handler.js';
import type { ProjectAccess } from '../../middlewares/project-access.js';
import { emitToProject } from '../../sockets/emitter.js';
import type { ChatMessagePayload } from '../../sockets/events.js';
import * as repository from './chat.repository.js';
import type { MessageRow } from './chat.repository.js';
import type { ListMessagesQuery, MarkReadInput, SendMessageInput } from './chat.schema.js';

export interface ReadState {
  lastReadAt: string | null;
  unreadCount: number;
}

export interface MessagePage {
  /** En orden cronológico, listos para pintar de arriba abajo. */
  messages: ChatMessagePayload[];
  /**
   * Id para pedir el bloque siguiente en el mismo sentido, o `null` si no queda nada.
   * Con `despues` es lo que le dice al cliente si se puso al día o si le falta un
   * trozo: un historial con un agujero invisible es peor que uno corto.
   */
  nextCursor: string | null;
}

/**
 * Un solo formato para la respuesta REST y para el evento: el frontend maneja
 * un único tipo de mensaje, llegue por donde llegue.
 */
export const toChatMessage = (
  conversationId: string,
  row: MessageRow,
  projectId?: string,
): ChatMessagePayload => ({
  id: row.id,
  conversationId,
  ...(projectId && { projectId }),
  content: row.content,
  createdAt: row.createdAt.toISOString(),
  sender: row.sender,
});

/**
 * `requireProjectMember` ya descartó a quien no es miembro, con un 404. Quien
 * llega aquí sin ser participante es el coordinador: ve el proyecto pero no su
 * chat, así que para él sí existe y corresponde un 403.
 */
const getConversationId = async (projectId: string, userId: string): Promise<string> => {
  const conversationId = await repository.findProjectConversationId(projectId, userId);

  if (!conversationId) {
    throw new AppError(403, 'FORBIDDEN', 'Solo los miembros del proyecto participan en su chat');
  }

  return conversationId;
};

type ToMessage = (row: MessageRow) => ChatMessagePayload;

const pageAfter = async (
  conversationId: string,
  after: string,
  limit: number,
  toMessage: ToMessage,
): Promise<MessagePage> => {
  if (!(await repository.findMessageDate(conversationId, after))) {
    throw new AppError(404, 'NOT_FOUND', 'El mensaje no existe en esta conversación');
  }

  const rows = await repository.findMessagesAfter(conversationId, after, limit + 1);
  const page = rows.slice(0, limit);

  return {
    messages: page.map(toMessage),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  };
};

/** El historial de una conversación, en los dos sentidos. Lo comparten proyecto y privado. */
export const pageOf = async (
  conversationId: string,
  query: ListMessagesQuery,
  toMessage: ToMessage,
): Promise<MessagePage> => {
  if (query.after) {
    return pageAfter(conversationId, query.after, query.limit, toMessage);
  }

  const rows = await repository.findMessages(conversationId, query.before, query.limit + 1);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  return {
    messages: page.reverse().map(toMessage),
    // Tras invertir, el más antiguo queda primero: es el cursor del bloque anterior.
    nextCursor: hasMore ? page[0].id : null,
  };
};

export const listMessages = async (
  access: ProjectAccess,
  userId: string,
  query: ListMessagesQuery,
): Promise<MessagePage> => {
  const conversationId = await getConversationId(access.project.id, userId);

  return pageOf(conversationId, query, (row) =>
    toChatMessage(conversationId, row, access.project.id),
  );
};

export const sendMessage = async (
  access: ProjectAccess,
  userId: string,
  input: SendMessageInput,
): Promise<ChatMessagePayload> => {
  const conversationId = await getConversationId(access.project.id, userId);

  // Mismo criterio que la edición del proyecto: cerrado es de solo lectura. El
  // historial se sigue pudiendo consultar.
  if (access.project.status === ProjectStatus.COMPLETED) {
    throw new AppError(409, 'CONFLICT', 'El proyecto está cerrado y su chat es de solo lectura');
  }

  const row = await repository.createMessage(conversationId, userId, input.content);
  const message = toChatMessage(conversationId, row, access.project.id);

  // Después de persistir, nunca antes. Va a toda la sala, remitente incluido:
  // sus otras pestañas también lo necesitan, y la que envió lo descarta por id.
  emitToProject(access.project.id, 'chat:mensaje', message);

  return message;
};

export const readStateOf = async (conversationId: string, userId: string): Promise<ReadState> => {
  const lastReadAt = await repository.findLastReadAt(conversationId, userId);

  return {
    lastReadAt: lastReadAt?.toISOString() ?? null,
    unreadCount: await repository.countUnread(conversationId, userId, lastReadAt),
  };
};

/** Calculado en el servidor: un contador que vive en la pestaña no sobrevive a nada. */
export const getReadState = async (access: ProjectAccess, userId: string): Promise<ReadState> =>
  readStateOf(await getConversationId(access.project.id, userId), userId);

/** La fecha sale del mensaje, nunca del cliente. */
export const markReadIn = async (
  conversationId: string,
  userId: string,
  input: MarkReadInput,
): Promise<ReadState> => {
  const createdAt = await repository.findMessageDate(conversationId, input.messageId);

  if (!createdAt) {
    throw new AppError(404, 'NOT_FOUND', 'El mensaje no existe en esta conversación');
  }

  await repository.advanceLastRead(conversationId, userId, createdAt);

  return readStateOf(conversationId, userId);
};

/** Un proyecto cerrado también acepta la marca: es de quien lee, no toca el expediente. */
export const markRead = async (
  access: ProjectAccess,
  userId: string,
  input: MarkReadInput,
): Promise<ReadState> =>
  markReadIn(await getConversationId(access.project.id, userId), userId, input);
