import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ChatMessage, ListMessagesQuery, MessagePage, ReadState } from './chat.types';
import type { Contact, ConversationSummary } from './conversations.types';
import { toQueryParams } from './query-params';

/**
 * Cliente tipado de los chats privados. El historial, enviar y la marca de leído son los
 * mismos que en `ChatApi`; lo que cambia es que la conversación va en la ruta, y el backend
 * comprueba que quien pregunta participa.
 */
@Injectable({ providedIn: 'root' })
export class ConversationsApi {
  readonly #http = inject(HttpClient);
  readonly #url = `${environment.apiUrl}/conversaciones`;

  /** Las propias con mensajes, lo más reciente primero. Es la lista completa: no se pagina. */
  async list(): Promise<ConversationSummary[]> {
    const { conversations } = await firstValueFrom(
      this.#http.get<{ conversations: ConversationSummary[] }>(this.#url),
    );

    return conversations;
  }

  async contacts(): Promise<Contact[]> {
    const { contacts } = await firstValueFrom(
      this.#http.get<{ contacts: Contact[] }>(`${this.#url}/contactos`),
    );

    return contacts;
  }

  /** La crea, o recupera la que ya existe con esa persona. */
  async open(userId: string): Promise<ConversationSummary> {
    const { conversation } = await firstValueFrom(
      this.#http.post<{ conversation: ConversationSummary }>(this.#url, { userId }),
    );

    return conversation;
  }

  async get(conversationId: string): Promise<ConversationSummary> {
    const { conversation } = await firstValueFrom(
      this.#http.get<{ conversation: ConversationSummary }>(`${this.#url}/${conversationId}`),
    );

    return conversation;
  }

  /** Sin cursor, el bloque más reciente. */
  messages(conversationId: string, query: ListMessagesQuery = {}): Promise<MessagePage> {
    return firstValueFrom(
      this.#http.get<MessagePage>(`${this.#url}/${conversationId}/mensajes`, {
        params: toQueryParams({ ...query }),
      }),
    );
  }

  async send(conversationId: string, content: string): Promise<ChatMessage> {
    const { message } = await firstValueFrom(
      this.#http.post<{ message: ChatMessage }>(`${this.#url}/${conversationId}/mensajes`, {
        content,
      }),
    );

    return message;
  }

  readState(conversationId: string): Promise<ReadState> {
    return firstValueFrom(
      this.#http.get<ReadState>(`${this.#url}/${conversationId}/mensajes/lectura`),
    );
  }

  /** Manda el id, nunca una fecha: el reloj de esta máquina no es el del servidor. */
  markRead(conversationId: string, messageId: string): Promise<ReadState> {
    return firstValueFrom(
      this.#http.put<ReadState>(`${this.#url}/${conversationId}/mensajes/lectura`, { messageId }),
    );
  }
}
