import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ChatMessage, ListMessagesQuery, MessagePage, ReadState } from './chat.types';
import { toQueryParams } from './query-params';

/**
 * Cliente tipado del chat de un proyecto. El envío va por REST: el socket solo
 * escucha. La conversación se deduce del proyecto de la ruta; el cliente nunca
 * manda su identificador.
 */
@Injectable({ providedIn: 'root' })
export class ChatApi {
  readonly #http = inject(HttpClient);

  /** Sin cursor, el bloque más reciente. */
  list(projectId: string, query: ListMessagesQuery = {}): Promise<MessagePage> {
    return firstValueFrom(
      this.#http.get<MessagePage>(this.#url(projectId), { params: toQueryParams({ ...query }) }),
    );
  }

  async send(projectId: string, content: string): Promise<ChatMessage> {
    const { message } = await firstValueFrom(
      this.#http.post<{ message: ChatMessage }>(this.#url(projectId), { content }),
    );

    return message;
  }

  readState(projectId: string): Promise<ReadState> {
    return firstValueFrom(this.#http.get<ReadState>(`${this.#url(projectId)}/lectura`));
  }

  /** Manda el id, nunca una fecha: el reloj de esta máquina no es el del servidor. */
  markRead(projectId: string, messageId: string): Promise<ReadState> {
    return firstValueFrom(
      this.#http.put<ReadState>(`${this.#url(projectId)}/lectura`, { messageId }),
    );
  }

  #url(projectId: string): string {
    return `${environment.apiUrl}/proyectos/${projectId}/mensajes`;
  }
}
