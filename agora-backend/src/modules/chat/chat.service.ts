import { ProjectStatus } from '@prisma/client';
import { AppError } from '../../middlewares/error-handler.js';
import type { ProjectAccess } from '../../middlewares/project-access.js';
import { emitToProject } from '../../sockets/emitter.js';
import type { ChatMessagePayload } from '../../sockets/events.js';
import * as repository from './chat.repository.js';
import type { MessageRow } from './chat.repository.js';
import type { ListMessagesQuery, SendMessageInput } from './chat.schema.js';

export interface MessagePage {
  /** En orden cronológico, listos para pintar de arriba abajo. */
  messages: ChatMessagePayload[];
  /** Id para pedir el bloque anterior, o `null` si ya no queda historial. */
  nextCursor: string | null;
}

/**
 * Un solo formato para la respuesta REST y para el evento: el frontend maneja
 * un único tipo de mensaje, llegue por donde llegue.
 */
const toChatMessage = (projectId: string, row: MessageRow): ChatMessagePayload => ({
  id: row.id,
  projectId,
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

export const listMessages = async (
  access: ProjectAccess,
  userId: string,
  query: ListMessagesQuery,
): Promise<MessagePage> => {
  const conversationId = await getConversationId(access.project.id, userId);

  const rows = await repository.findMessages(conversationId, query.before, query.limit + 1);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  return {
    messages: page.reverse().map((row) => toChatMessage(access.project.id, row)),
    // Tras invertir, el más antiguo queda primero: es el cursor del bloque anterior.
    nextCursor: hasMore ? page[0].id : null,
  };
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
  const message = toChatMessage(access.project.id, row);

  // Después de persistir, nunca antes. Va a toda la sala, remitente incluido:
  // sus otras pestañas también lo necesitan, y la que envió lo descarta por id.
  emitToProject(access.project.id, 'chat:mensaje', message);

  return message;
};
