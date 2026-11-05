import { Component, computed, effect, inject, input } from '@angular/core';
import { ChatApi } from '../../../core/api/chat.api';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { Tabs, type TabItem } from '../../../shared/ui/tabs/tabs';

/**
 * Las secciones de un proyecto. La conversación solo es de los miembros, y lleva la
 * cifra de no leídos: quien llega a una de estas pantallas por URL no pasó por la lista,
 * y sin pedirla aquí la pestaña diría que no hay nada sin leer.
 */
@Component({
  selector: 'app-project-tabs',
  imports: [Tabs],
  template: `<app-tabs label="Secciones del proyecto" [items]="items()" />`,
  // Sin token: `min-w-0` no genera CSS con este tema, y es mecánica de `grid`, no un valor
  // de diseño. Sin esto, la barra ensancha la página en vez de desplazarse.
  styles: ':host { display: block; min-width: 0; }',
})
export class ProjectTabs {
  readonly #chat = inject(ChatApi);
  readonly #realtime = inject(RealtimeService);

  readonly projectId = input.required<string>();
  readonly isMember = input.required<boolean>();
  /** La pantalla del chat ya pide la marca, y ahí la cifra no hace falta. */
  readonly chatOpen = input(false);

  protected readonly items = computed<TabItem[]>(() => {
    const base = ['/proyectos', this.projectId()];

    return [
      { label: 'Resumen', link: base, exact: true },
      { label: 'Cronograma', link: [...base, 'cronograma'] },
      { label: 'Tareas', link: [...base, 'tareas'] },
      { label: 'Avances', link: [...base, 'avances'] },
      { label: 'Documentos', link: [...base, 'documentos'] },
      ...(this.isMember()
        ? [
            {
              label: 'Conversación',
              link: [...base, 'conversacion'],
              badge: this.chatOpen() ? 0 : this.#realtime.unreadIn(this.projectId()),
            },
          ]
        : []),
    ];
  });

  constructor() {
    effect(() => {
      const projectId = this.projectId();

      if (this.isMember() && !this.chatOpen()) {
        // Un fallo solo deja de pintar la cifra.
        this.#chat
          .readState(projectId)
          .then(({ unreadCount }) => this.#realtime.setUnread(projectId, unreadCount))
          .catch(() => undefined);
      }
    });
  }
}
