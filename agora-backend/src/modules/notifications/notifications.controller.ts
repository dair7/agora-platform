import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/authenticate.js';
import * as service from './notifications.service.js';
import type { ListNotificationsQuery, NotificationParams } from './notifications.schema.js';

export const list: RequestHandler = async (req, res) => {
  const page = await service.listNotifications(
    getAuthUser(req).id,
    req.query as unknown as ListNotificationsQuery,
  );

  res.json(page);
};

export const markRead: RequestHandler = async (req, res) => {
  const { notificationId } = req.params as NotificationParams;

  const notification = await service.markRead(getAuthUser(req).id, notificationId);

  res.json({ notification });
};

export const markAllRead: RequestHandler = async (req, res) => {
  const updated = await service.markAllRead(getAuthUser(req).id);

  res.json({ updated });
};
