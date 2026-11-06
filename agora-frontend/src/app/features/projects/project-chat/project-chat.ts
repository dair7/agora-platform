import { Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiErrorCode } from '../../../core/api/api-error';
import { ChatApi } from '../../../core/api/chat.api';
import { ProjectsApi } from '../../../core/api/projects.api';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { Button } from '../../../shared/ui/button/button';
import { Empty } from '../../../shared/ui/empty/empty';
import { ChatThread, type ChatSource } from '../../chat/chat-thread';
import { ProjectTabs } from '../project-tabs/project-tabs';

/**
 * La conversación de un proyecto. Quien no es miembro recibe la pantalla de no
 * encontrado, igual que en el detalle. La coordinación ve el proyecto pero no
 * participa de su chat: el backend le responde 403 y la pantalla la manda al detalle.
 */
@Component({
  selector: 'app-project-chat',
  imports: [Button, ChatThread, Empty, ProjectTabs, RouterLink],
  templateUrl: './project-chat.html',
})
export class ProjectChat {
  readonly #router = inject(Router);
  readonly #chat = inject(ChatApi);
  readonly #projects = inject(ProjectsApi);
  readonly #realtime = inject(RealtimeService);

  readonly #params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });
  protected readonly projectId = computed(() => this.#params().get('projectId') ?? '');

  protected readonly project = resource({
    params: () => this.projectId(),
    loader: ({ params }) => this.#projects.get(params),
  });

  /** Un proyecto ajeno y una URL rota son la misma pantalla: ver el detalle. */
  protected readonly notFound = computed(() => {
    const code = apiErrorCode(this.project.error());

    return code === 'NOT_FOUND' || code === 'VALIDATION_ERROR';
  });

  protected readonly closed = computed(
    () => this.project.hasValue() && this.project.value().status === 'COMPLETED',
  );

  protected readonly online = computed(() => this.#realtime.presenceIn(this.projectId()));

  protected readonly source = computed<ChatSource>(() => {
    const projectId = this.projectId();

    return {
      key: projectId,
      list: (query) => this.#chat.list(projectId, query),
      send: (content) => this.#chat.send(projectId, content),
      readState: () => this.#chat.readState(projectId),
      markRead: (messageId) => this.#chat.markRead(projectId, messageId),
      owns: (message) => message.projectId === projectId,
      setUnread: (count) => this.#realtime.setUnread(projectId, count),
      onForbidden: () =>
        void this.#router.navigate(['/proyectos', projectId], { replaceUrl: true }),
    };
  });
}
