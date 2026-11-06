import {
  Component,
  ElementRef,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { apiErrorOutcome } from '../../../core/api/api-error';
import { NotificationsApi } from '../../../core/api/notifications.api';
import type { AppNotification } from '../../../core/api/notifications.types';
import { formatMoment } from '../../../core/format/message-dates';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { Button } from '../../../shared/ui/button/button';
import { Empty } from '../../../shared/ui/empty/empty';
import { Icon } from '../../../shared/ui/icon/icon';
import { Notice } from '../../../shared/ui/notice/notice';
import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { UnreadBadge } from '../../../shared/ui/unread-badge/unread-badge';

/** A dónde lleva: la tarea no tiene ruta propia, así que va a las tareas de su proyecto. */
const linkOf = ({ type, projectId }: AppNotification): readonly string[] | null => {
  if (!projectId) {
    return null;
  }

  return type === 'TASK_ASSIGNED' ? ['/proyectos', projectId, 'tareas'] : ['/proyectos', projectId];
};

/**
 * La bandeja, en la cabecera de la aplicación y no dentro de un proyecto: las
 * notificaciones son de la persona. Vive en el armazón, que dura lo que la sesión, y la
 * coordinación también la tiene.
 *
 * La cifra es siempre la del servidor. Lo que llega por el socket entra en la lista al
 * momento, y además se vuelve a pedir: con una petición en curso, su respuesta sería
 * anterior al evento y se llevaría lo que acaba de entrar. De dos peticiones solo cuenta
 * la última, como en `LiveList`.
 *
 * Se vuelve a pedir también al abrir: marcar en otra pestaña no avisa, y una notificación
 * que ya no lleva a ningún sitio tiene que perder su enlace.
 *
 * Una sin `projectId` no tiene enlace y se queda en la lista: pasó de verdad.
 *
 * Por debajo de `md` el mismo panel ocupa la pantalla entera, por CSS, y no es una ruta:
 * dos caminos para lo mismo acaban divergiendo. Ahí tapa el botón que lo abrió y no hay
 * Escape ni clic fuera, así que lleva «Cerrar» y el foco entra en él.
 */
@Component({
  selector: 'app-notification-inbox',
  imports: [Button, Empty, Icon, Notice, RouterLink, Skeleton, UnreadBadge],
  templateUrl: './notification-inbox.html',
  styleUrl: './notification-inbox.css',
  host: {
    '(document:click)': 'closeOutside($event)',
    '(document:keydown.escape)': 'closeWithEscape()',
    '(focusout)': 'closeWhenFocusLeaves($event)',
  },
})
export class NotificationInbox {
  readonly #api = inject(NotificationsApi);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #injector = inject(Injector);
  private readonly opener = viewChild.required('opener', { read: ElementRef });
  private readonly closer = viewChild('closer', { read: ElementRef });
  private readonly panel = viewChild('panel', { read: ElementRef });

  /** En la barra inferior: ocupa su parte del ancho, con menos relleno para que quepa. */
  readonly inBar = input(false);

  readonly #items = signal<readonly AppNotification[] | null>(null);
  #run = 0;

  protected readonly unread = signal(0);
  protected readonly open = signal(false);
  protected readonly marking = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly loading = computed(() => this.#items() === null && this.failure() === null);
  protected readonly isEmpty = computed(() => this.#items()?.length === 0);
  protected readonly rows = computed(() =>
    (this.#items() ?? []).map((notification) => ({
      notification,
      link: linkOf(notification),
      moment: formatMoment(notification.createdAt),
    })),
  );

  protected readonly unreadLabel = computed(() =>
    this.unread() === 1 ? '1 notificación sin leer' : `${this.unread()} notificaciones sin leer`,
  );

  constructor() {
    const realtime = inject(RealtimeService);
    const destroyRef = inject(DestroyRef);
    let lostConnection = false;

    void this.refresh();

    realtime.notifications.pipe(takeUntilDestroyed(destroyRef)).subscribe((notification) => {
      const others = (this.#items() ?? []).filter((item) => item.id !== notification.id);

      this.#items.set([notification, ...others]);
      this.unread.update((count) => count + 1);
      void this.refresh();
    });

    realtime.disconnected.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      lostConnection = true;
    });

    // Lo que llegó sin conexión el socket nunca lo entregó.
    realtime.connected.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      if (lostConnection) {
        lostConnection = false;
        void this.refresh();
      }
    });
  }

  protected async refresh(): Promise<void> {
    const run = ++this.#run;

    try {
      const { notifications, unreadCount } = await this.#api.list();

      if (run === this.#run) {
        this.#items.set(notifications);
        this.unread.set(unreadCount);
        this.failure.set(null);
      }
    } catch (error) {
      if (run === this.#run) {
        this.#fail(error);
      }
    }
  }

  protected toggle(): void {
    this.open.update((open) => !open);

    if (this.open()) {
      void this.refresh();
      afterNextRender(
        () => {
          if (this.#fullScreen()) {
            (this.closer()?.nativeElement as HTMLElement).focus();
          }
        },
        { injector: this.#injector },
      );
    }
  }

  protected close(): void {
    this.open.set(false);
  }

  protected closeAndReturn(): void {
    this.close();
    (this.opener().nativeElement as HTMLElement).focus();
  }

  protected closeOutside(event: Event): void {
    if (this.open() && !event.composedPath().includes(this.#host.nativeElement)) {
      this.close();
    }
  }

  protected closeWithEscape(): void {
    if (this.open()) {
      this.closeAndReturn();
    }
  }

  /**
   * Con el teclado: pasar de largo no deja el panel abierto tapando lo que hay detrás. El
   * botón que lo abrió cuenta como dentro, porque pulsarlo ya lo cierra, salvo a pantalla
   * completa, donde queda debajo del panel y el foco no se vería.
   */
  protected closeWhenFocusLeaves({ relatedTarget }: FocusEvent): void {
    const inside = (this.#fullScreen() ? this.panel() : this.#host)?.nativeElement as HTMLElement;

    if (this.open() && relatedTarget instanceof Node && !inside?.contains(relatedTarget)) {
      this.close();
    }
  }

  /** «Cerrar» solo se pinta a pantalla completa. */
  #fullScreen(): boolean {
    return (this.closer()?.nativeElement as HTMLElement | undefined)?.checkVisibility() ?? false;
  }

  protected markRead(notification: AppNotification): Promise<void> {
    return this.#mark(() => this.#api.markRead(notification.id));
  }

  protected markAllRead(): Promise<void> {
    return this.#mark(() => this.#api.markAllRead());
  }

  /** Seguir el enlace también la da por leída. */
  protected follow(notification: AppNotification): void {
    this.close();

    if (!notification.isRead) {
      void this.markRead(notification);
    }
  }

  async #mark(write: () => Promise<unknown>): Promise<void> {
    this.marking.set(true);

    try {
      await write();
      await this.refresh();
    } catch (error) {
      this.#fail(error);
    } finally {
      this.marking.set(false);
    }
  }

  #fail(error: unknown): void {
    const outcome = apiErrorOutcome(error);

    this.failure.set(outcome.kind === 'none' ? null : outcome.message);
  }
}
