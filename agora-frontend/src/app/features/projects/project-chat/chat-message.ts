import { Component, input, output } from '@angular/core';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { Button } from '../../../shared/ui/button/button';
import type { MessageItem } from './chat-timeline';

/**
 * Del componente Mensaje del sistema de diseño. Los propios van a la derecha sobre
 * `veril-tenue`; los ajenos a la izquierda sobre `superficie-00` con borde. En una
 * racha de la misma persona, el nombre y el avatar salen solo en el primero.
 *
 * Dos diferencias con su preview, porque la prosa del sistema manda sobre un valor
 * suelto del ejemplo: el atenuado es `opacidad-deshabilitado` y no 0.55, y la hora
 * va en `tinta-media` y no en `tinta-tenue`, que el estilo `secundario` prohíbe.
 */
@Component({
  selector: 'app-chat-message',
  imports: [Avatar, Button],
  template: `
    @let message = item();
    @let sending = message.pending?.status === 'sending';

    <div class="flex items-start gap-espacio-2" [class.justify-end]="message.own">
      @if (!message.own) {
        @if (message.first) {
          <app-avatar [name]="message.senderName" [online]="online()" />
        } @else {
          <span class="chat-hueco shrink-0"></span>
        }
      }

      <div class="chat-cuerpo">
        @if (!message.own && message.first) {
          <p class="secundario text-tinta-media mb-espacio-1">
            {{ message.senderName }}
            <span class="tabular-nums">{{ message.time }}</span>
          </p>
        }

        <!-- textContent y no interpolación: con pre-wrap, el espacio de la plantilla
             alrededor de las llaves se vería como sangría en la primera línea. -->
        <p
          class="chat-burbuja cuerpo text-tinta py-espacio-2 px-espacio-3 rounded-radio-md border whitespace-pre-wrap wrap-anywhere"
          [class]="
            message.own ? 'bg-veril-tenue border-veril-tenue' : 'bg-superficie-00 border-borde'
          "
          [class.opacity-opacidad-deshabilitado]="sending"
          [textContent]="message.content"
        ></p>

        @if (message.own) {
          @if (message.pending?.status === 'failed') {
            <div class="grid justify-items-end">
              <p class="secundario text-arrecife text-right mt-espacio-1">
                {{ message.pending?.error }}
              </p>
              <button
                appButton
                variant="subtle"
                type="button"
                class="-mr-espacio-4"
                (click)="retry.emit()"
              >
                Reintentar
              </button>
            </div>
          } @else {
            <p class="secundario text-tinta-media text-right mt-espacio-1">
              @if (sending) {
                Enviando…
              } @else {
                <span class="tabular-nums">{{ message.time }}</span>
              }
            </p>
          }
        }
      </div>
    </div>
  `,
  styleUrl: './chat-message.css',
  host: { class: 'block' },
})
export class ChatMessageRow {
  readonly item = input.required<MessageItem>();
  /** Si quien lo escribió está en línea. */
  readonly online = input(false);

  readonly retry = output<void>();
}
