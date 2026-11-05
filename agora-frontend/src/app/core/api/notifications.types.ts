// Tipos del contrato de /api/v1/notificaciones (`modules/notifications`).

/** `AppNotification` y no `Notification`, que es la de la API del navegador. */
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  resourceId: string | null;
  /** A qué proyecto lleva. `null` si ya no se puede llegar: no se ofrece el enlace. */
  projectId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  notifications: AppNotification[];
  unreadCount: number;
}
