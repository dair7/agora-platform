import { Component, computed, effect, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { apiErrorCode, apiErrorOutcome } from '../../../core/api/api-error';
import { ConversationsApi } from '../../../core/api/conversations.api';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { Button } from '../../../shared/ui/button/button';
import { Empty } from '../../../shared/ui/empty/empty';
import { Notice } from '../../../shared/ui/notice/notice';
import { ChatThread, type ChatSource } from '../../chat/chat-thread';

/**
 * Una conversación privada. Es el mismo hilo que el chat de un proyecto, sin presencia: no
 * existe fuera de un proyecto. Quien no participa y una URL rota ven la misma pantalla.
 */
@Component({
  selector: 'app-conversation-detail',
  imports: [Button, ChatThread, Empty, Notice, RouterLink],
  templateUrl: './conversation-detail.html',
})
export class ConversationDetail {
  readonly #api = inject(ConversationsApi);
  readonly #realtime = inject(RealtimeService);
  readonly #title = inject(Title);

  readonly #params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });
  protected readonly conversationId = computed(() => this.#params().get('conversationId') ?? '');

  protected readonly conversation = resource({
    params: () => this.conversationId(),
    loader: ({ params }) => this.#api.get(params),
  });

  protected readonly value = computed(() =>
    this.conversation.hasValue() ? this.conversation.value() : null,
  );

  protected readonly notFound = computed(() => {
    const code = apiErrorCode(this.conversation.error());

    return code === 'NOT_FOUND' || code === 'VALIDATION_ERROR';
  });

  protected readonly errorMessage = computed(() => {
    const error = this.conversation.error();

    if (!error || this.notFound()) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  /** Se lee, pero no se escribe a quien ya no va a contestar. */
  protected readonly otherIsInactive = computed(() => this.value()?.otherUser.isActive === false);

  protected readonly source = computed<ChatSource>(() => {
    const id = this.conversationId();

    return {
      key: id,
      list: (query) => this.#api.messages(id, query),
      send: (content) => this.#api.send(id, content),
      readState: () => this.#api.readState(id),
      markRead: (messageId) => this.#api.markRead(id, messageId),
      owns: (message) => message.conversationId === id,
      setUnread: (count) => this.#realtime.setConversationUnread(id, count),
      // La cuenta pudo desactivarse con la pantalla abierta.
      sendErrors: { CONFLICT: 'Esta cuenta está desactivada: ya no puedes escribirle.' },
    };
  });

  constructor() {
    effect(() => {
      const name = this.value()?.otherUser.fullName;

      if (name) {
        this.#title.setTitle(`${name} · Ágora`);
      }
    });
  }
}
