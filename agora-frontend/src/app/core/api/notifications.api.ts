import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { AppNotification, NotificationPage } from './notifications.types';

/** Cliente tipado de la bandeja de quien llama, también de la coordinación. */
@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  readonly #http = inject(HttpClient);
  readonly #url = `${environment.apiUrl}/notificaciones`;

  /** Lo más reciente primero. `unreadCount` cuenta todas, no solo las de la página. */
  list(): Promise<NotificationPage> {
    return firstValueFrom(this.#http.get<NotificationPage>(this.#url));
  }

  /** Idempotente: marcar otra vez no mueve `readAt`. */
  async markRead(notificationId: string): Promise<AppNotification> {
    const { notification } = await firstValueFrom(
      this.#http.post<{ notification: AppNotification }>(
        `${this.#url}/${notificationId}/leida`,
        null,
      ),
    );

    return notification;
  }

  async markAllRead(): Promise<void> {
    await firstValueFrom(this.#http.post<{ updated: number }>(`${this.#url}/leidas`, null));
  }
}
