import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Button } from '../../shared/ui/button/button';
import { Field, FieldTextarea } from '../../shared/ui/field/field';

/** Hasta esta distancia del fondo se considera que la persona está abajo. */
const BOTTOM_TOLERANCE_PX = 32;

export const isAtBottom = (element: HTMLElement | undefined): boolean =>
  !element ||
  element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_TOLERANCE_PX;

/**
 * Donde se escribe un mensaje, en cualquier chat. Es un solo componente porque lleva cuatro
 * cosas medidas, y una segunda copia perdería alguna sin que nadie lo note hasta que
 * alguien escriba desde el móvil:
 *
 * - Sigue a la vista con el teclado abierto: ver `#keepInView()`.
 * - El campo crece con el texto, y eso empuja «Enviar mensaje» por debajo del teclado.
 * - De solo lectura y no deshabilitado mientras envía: conserva el foco.
 * - Es un `textarea`: con eso el armazón esconde la barra inferior al escribir.
 */
@Component({
  selector: 'app-chat-composer',
  imports: [Button, Field, FieldTextarea],
  template: `
    <form
      #form
      class="grid gap-espacio-3"
      novalidate
      (submit)="$event.preventDefault(); submitted.emit()"
    >
      <app-field for="chat-compositor" label="Mensaje">
        <!-- De solo lectura y no deshabilitado mientras envía: conserva el foco. -->
        <textarea
          #field
          appTextarea
          id="chat-compositor"
          rows="2"
          [disabled]="disabled()"
          [readOnly]="sending()"
          [value]="draft()"
          (focus)="onFocus()"
          (input)="onInput($event)"
          (keydown.enter)="onEnter($event)"
        ></textarea>
      </app-field>
      <div class="flex justify-end">
        <button appButton type="submit" [disabled]="!ready()">
          {{ sending() ? 'Enviando' : 'Enviar mensaje' }}
        </button>
      </div>
    </form>
  `,
})
export class ChatComposer {
  readonly draft = input.required<string>();
  readonly sending = input(false);
  readonly disabled = input(false);
  /** La lista de mensajes: si estaba al fondo, se queda al fondo al abrirse el teclado. */
  readonly scroller = input<HTMLElement>();

  readonly edited = output<string>();
  readonly submitted = output<void>();

  protected readonly ready = computed(
    () => !this.disabled() && !this.sending() && this.draft().trim() !== '',
  );

  // `private` de TypeScript: `viewChild` no admite los campos privados de ES.
  private readonly field = viewChild.required<ElementRef<HTMLTextAreaElement>>('field');
  private readonly form = viewChild.required<ElementRef<HTMLFormElement>>('form');

  #stickToBottom = false;

  constructor() {
    const onViewportResize = () => this.#keepInView();

    window.visualViewport?.addEventListener('resize', onViewportResize);
    inject(DestroyRef).onDestroy(() =>
      window.visualViewport?.removeEventListener('resize', onViewportResize),
    );
  }

  focus(): void {
    this.field().nativeElement.focus();
  }

  /** Antes de que el teclado encoja la lista: después ya no se sabe si estaba al fondo. */
  protected onFocus(): void {
    this.#stickToBottom = isAtBottom(this.scroller());
  }

  protected onInput(event: Event): void {
    this.edited.emit((event.target as HTMLTextAreaElement).value);
    // El campo crece con el texto, y empuja «Enviar mensaje» por debajo del teclado.
    this.#reveal();
  }

  /** Enter envía y Shift+Enter hace salto: este evento solo llega sin modificadores. */
  protected onEnter(event: Event): void {
    // La tecla que confirma una composición (IME) no es un envío.
    if (!(event as KeyboardEvent).isComposing) {
      event.preventDefault();
      this.submitted.emit();
    }
  }

  /**
   * El navegador lleva a la vista el campo y no el formulario, y «Enviar mensaje» va debajo.
   * Se mira el `visualViewport`, que es lo único que cambia con el teclado en todos los
   * navegadores: Safari no conoce `interactive-widget`.
   */
  #keepInView(): void {
    if (document.activeElement !== this.field().nativeElement) {
      return;
    }

    const list = this.scroller();

    if (list && this.#stickToBottom) {
      list.scrollTop = list.scrollHeight;
    }

    this.#reveal();
  }

  /** Solo si se sale: en cada tecla, llevarlo al borde movería la página sin motivo. */
  #reveal(): void {
    const form = this.form().nativeElement;
    const viewport = window.visualViewport;
    const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;

    if (form.getBoundingClientRect().bottom > bottom) {
      form.scrollIntoView({ block: 'end' });
    }
  }
}
