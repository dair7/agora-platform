import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { apiErrorOutcome } from '../../../core/api/api-error';
import { ConversationsApi } from '../../../core/api/conversations.api';
import type { Contact, ConversationSummary } from '../../../core/api/conversations.types';
import { formatMoment } from '../../../core/format/message-dates';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { SessionService } from '../../../core/session/session.service';
import type { SystemRole } from '../../../core/session/session.types';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { Button } from '../../../shared/ui/button/button';
import { Empty } from '../../../shared/ui/empty/empty';
import { Notice } from '../../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { UnreadBadge } from '../../../shared/ui/unread-badge/unread-badge';
import { LiveList } from '../../projects/live-list';

const ROLE_LABELS: Record<SystemRole, string> = {
  COORDINATOR: 'Coordinación',
  RESEARCHER: 'Investigación',
};

const describe = (error: unknown): string | null => {
  const outcome = apiErrorOutcome(error);

  return outcome.kind === 'none' ? null : outcome.message;
};

/**
 * Las conversaciones privadas de la persona, y con quién puede empezar una. Lo que llega
 * por el socket vuelve a pedir la lista: el último mensaje y el orden salen del servidor.
 * Cada pedido deja la cifra del servidor en `RealtimeService`, que es de donde sale la de
 * las barras.
 */
@Component({
  selector: 'app-conversation-list',
  imports: [Avatar, Button, Empty, LoadingStatus, Notice, RouterLink, Skeleton, UnreadBadge],
  templateUrl: './conversation-list.html',
  styleUrl: './conversation-list.css',
})
export class ConversationList {
  readonly #api = inject(ConversationsApi);
  readonly #router = inject(Router);
  readonly #realtime = inject(RealtimeService);
  readonly #session = inject(SessionService);

  protected readonly roleLabels = ROLE_LABELS;

  protected readonly list = new LiveList<ConversationSummary>(async () => {
    const conversations = await this.#api.list();

    this.#realtime.setConversationsUnread(conversations);

    return conversations;
  });

  protected readonly rows = computed(() =>
    (this.list.items() ?? []).map((conversation) => ({
      conversation,
      own: conversation.lastMessage?.senderId === this.#session.user()?.id,
      moment: conversation.lastMessage ? formatMoment(conversation.lastMessage.createdAt) : '',
    })),
  );

  protected readonly errorMessage = computed(() => {
    const error = this.list.error();

    return error ? describe(error) : null;
  });

  // Empezar una conversación.
  protected readonly choosing = signal(false);
  protected readonly contacts = signal<readonly Contact[] | null>(null);
  protected readonly contactsError = signal<string | null>(null);
  protected readonly opening = signal<string | null>(null);

  constructor() {
    void this.list.refresh();

    this.#realtime.chatMessages.pipe(takeUntilDestroyed()).subscribe((message) => {
      if (!message.projectId) {
        void this.list.refresh();
      }
    });

    // Lo que llegó sin conexión el socket nunca lo entregó.
    this.#realtime.connected.pipe(takeUntilDestroyed()).subscribe(() => void this.list.refresh());
  }

  protected toggleChoosing(): void {
    this.choosing.update((open) => !open);

    if (this.choosing()) {
      void this.loadContacts();
    }
  }

  protected async loadContacts(): Promise<void> {
    this.contacts.set(null);
    this.contactsError.set(null);

    try {
      this.contacts.set(await this.#api.contacts());
    } catch (error) {
      this.contactsError.set(describe(error));
    }
  }

  /** Abrirla no la crea para la otra persona: no le aparece hasta que alguien escriba. */
  protected async open(contact: Contact): Promise<void> {
    this.opening.set(contact.id);
    this.contactsError.set(null);

    try {
      const { id } = await this.#api.open(contact.id);

      await this.#router.navigate(['/conversaciones', id]);
    } catch (error) {
      this.contactsError.set(describe(error));
    } finally {
      this.opening.set(null);
    }
  }
}
