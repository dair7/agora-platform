import type { Notification, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  resourceId: string;
}

/**
 * Recibe la transacción de quien la origina: la notificación se guarda junto al
 * hecho que cuenta, o una persona podría leer que la sumaron a algo que no ocurrió.
 */
export const createNotification = (
  tx: Prisma.TransactionClient,
  data: CreateNotificationData,
): Promise<Notification> => tx.notification.create({ data });

/** Solo las de esa persona: el filtro va en la consulta, no después. */
export const findNotifications = (userId: string, limit: number): Promise<Notification[]> =>
  prisma.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });

export const countUnread = (userId: string): Promise<number> =>
  prisma.notification.count({ where: { userId, isRead: false } });

export const findNotification = (
  userId: string,
  notificationId: string,
): Promise<Notification | null> =>
  prisma.notification.findFirst({ where: { id: notificationId, userId } });

/** `is_read` y `read_at` van siempre juntos: son el mismo hecho en dos columnas. */
export const markRead = (notificationId: string): Promise<Notification> =>
  prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });

/**
 * Las dos consultas que resuelven a qué proyecto lleva cada notificación. Filtran
 * por membresía: una tarea borrada o un proyecto del que la persona ya salió no
 * salen, y la pantalla no ofrece un enlace que terminaría en «no existe».
 */
export const findReachableTaskProjects = async (
  userId: string,
  taskIds: string[],
): Promise<Map<string, string>> => {
  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds }, phase: { project: { members: { some: { userId } } } } },
    select: { id: true, phase: { select: { projectId: true } } },
  });

  return new Map(tasks.map((task) => [task.id, task.phase.projectId]));
};

export const findReachableProjects = async (
  userId: string,
  projectIds: string[],
): Promise<Set<string>> => {
  const memberships = await prisma.projectMember.findMany({
    where: { userId, projectId: { in: projectIds } },
    select: { projectId: true },
  });

  return new Set(memberships.map((membership) => membership.projectId));
};

export const markAllRead = async (userId: string): Promise<number> => {
  const { count } = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return count;
};
