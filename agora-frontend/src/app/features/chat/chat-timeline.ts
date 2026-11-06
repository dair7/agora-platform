import type { ChatMessage } from '../../core/api/chat.types';
import {
  formatMessageDay,
  formatMessageTime,
  messageDayKey,
} from '../../core/format/message-dates';

/** Un mensaje que todavía no tiene identificador del servidor. */
export interface PendingMessage {
  localId: number;
  content: string;
  createdAt: string;
  status: 'sending' | 'failed';
  /** Por qué falló. */
  error: string | null;
}

export interface MessageItem {
  kind: 'message';
  key: string;
  senderId: string;
  senderName: string;
  content: string;
  time: string;
  own: boolean;
  /** El primero de una racha de la misma persona: lleva nombre y avatar. */
  first: boolean;
  /** Presente mientras no se confirme. */
  pending: PendingMessage | null;
}

export interface DayItem {
  kind: 'day';
  key: string;
  label: string;
}

export type TimelineItem = DayItem | MessageItem;

/**
 * Une por identificador, nunca por contenido: dos mensajes con el mismo texto
 * seguidos son normales, y el propio vuelve también por el evento. Insertar uno
 * que ya está no hace nada, así que da igual por dónde llegue primero.
 *
 * El orden es el del backend: por fecha y, a igual fecha, por id.
 */
export const mergeMessages = (
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): readonly ChatMessage[] => {
  const byId = new Map(current.map((message) => [message.id, message]));

  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
};

/** Los mensajes, con los provisionales al final y un separador en cada cambio de día. */
export const buildTimeline = (
  messages: readonly ChatMessage[],
  pending: readonly PendingMessage[],
  me: { id: string; fullName: string } | null,
): TimelineItem[] => {
  const items: TimelineItem[] = [];
  let lastDay: string | null = null;
  let lastSender: string | null = null;

  const push = (
    key: string,
    sender: { id: string; fullName: string },
    message: { content: string; createdAt: string },
    provisional: PendingMessage | null,
  ): void => {
    const day = messageDayKey(message.createdAt);

    if (day !== lastDay) {
      items.push({ kind: 'day', key: `dia-${day}`, label: formatMessageDay(message.createdAt) });
      lastDay = day;
      lastSender = null;
    }

    items.push({
      kind: 'message',
      key,
      senderId: sender.id,
      senderName: sender.fullName,
      content: message.content,
      time: formatMessageTime(message.createdAt),
      own: sender.id === me?.id,
      first: sender.id !== lastSender,
      pending: provisional,
    });
    lastSender = sender.id;
  };

  for (const message of messages) {
    push(message.id, message.sender, message, null);
  }

  for (const message of pending) {
    push(`local-${message.localId}`, me ?? { id: '', fullName: '' }, message, message);
  }

  return items;
};
