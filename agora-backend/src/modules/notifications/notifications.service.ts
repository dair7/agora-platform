import { NotificationType } from '@prisma/client';
import type { Notification } from '@prisma/client';
import { AppError } from '../../middlewares/error-handler.js';
import { emitToUser } from '../../sockets/emitter.js';
import type { NotificationPayload } from '../../sockets/events.js';
import * as repository from './notifications.repository.js';
import type { ListNotificationsQuery } from './notifications.schema.js';

export interface NotificationPage {
  notifications: NotificationPayload[];
  unreadCount: number;
}

const resourcesOfType = (notifications: Notification[], type: NotificationType): string[] =>
  notifications.flatMap((notification) =>
    notification.type === type && notification.resourceId ? [notification.resourceId] : [],
  );

/**
 * La fila guarda el hecho, y la API entrega lo que la pantalla necesita para llegar
 * hasta él: `resource_id` de una tarea es la tarea, y no hay ruta de tarea sin
 * proyecto. `projectId` es `null` cuando no se puede llegar: la tarea se borró, la
 * persona ya no es miembro, o el tipo no lleva a ningún proyecto. La notificación
 * sigue en la lista igual: pasó de verdad.
 *
 * Un formato para la respuesta REST y para el evento, como los mensajes del chat.
 * `userId` no sale: siempre es quien pregunta.
 */
const toPayloads = async (
  userId: string,
  notifications: Notification[],
): Promise<NotificationPayload[]> => {
  const [tasks, projects] = await Promise.all([
    repository.findReachableTaskProjects(
      userId,
      resourcesOfType(notifications, NotificationType.TASK_ASSIGNED),
    ),
    repository.findReachableProjects(
      userId,
      resourcesOfType(notifications, NotificationType.PROJECT_INVITATION),
    ),
  ]);

  const projectIdOf = ({ type, resourceId }: Notification): string | null => {
    if (!resourceId) {
      return null;
    }

    if (type === NotificationType.TASK_ASSIGNED) {
      return tasks.get(resourceId) ?? null;
    }

    return type === NotificationType.PROJECT_INVITATION && projects.has(resourceId)
      ? resourceId
      : null;
  };

  return notifications.map(({ userId: _userId, ...notification }) => ({
    ...notification,
    projectId: projectIdOf({ ...notification, userId }),
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  }));
};

/**
 * Se llama después de persistir. Las notificaciones son para hechos que otro
 * provocó y que te afectan: que te sumen a un proyecto y que te asignen una tarea.
 * Una bandeja que repite tus propios actos enseña a ignorarla, y todo lo demás ya
 * viaja como evento de sala.
 */
export const announce = async (notification: Notification): Promise<void> => {
  const [payload] = await toPayloads(notification.userId, [notification]);

  emitToUser(notification.userId, 'notificacion:nueva', payload);
};

export const listNotifications = async (
  userId: string,
  query: ListNotificationsQuery,
): Promise<NotificationPage> => {
  const [notifications, unreadCount] = await Promise.all([
    repository.findNotifications(userId, query.limit),
    repository.countUnread(userId),
  ]);

  return { notifications: await toPayloads(userId, notifications), unreadCount };
};

/** Idempotente: marcar otra vez no mueve `read_at`. La de otra persona no existe. */
export const markRead = async (
  userId: string,
  notificationId: string,
): Promise<NotificationPayload> => {
  const notification = await repository.findNotification(userId, notificationId);

  if (!notification) {
    throw new AppError(404, 'NOT_FOUND', 'La notificación no existe');
  }

  const read = notification.isRead ? notification : await repository.markRead(notificationId);
  const [payload] = await toPayloads(userId, [read]);

  return payload;
};

export const markAllRead = (userId: string): Promise<number> => repository.markAllRead(userId);
