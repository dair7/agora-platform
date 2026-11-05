import { computed, signal } from '@angular/core';

/**
 * Una lista que se vuelve a pedir cuando llega un evento. No es un `resource` a propósito:
 * al fallar una recarga, `resource` pierde el valor, y con él la lista y lo que hubiera
 * abierto debajo. Aquí un fallo deja lo que había y lo dice.
 *
 * Dos eventos seguidos lanzan dos peticiones: solo cuenta la última, porque la primera
 * pudo responder después con datos más viejos.
 */
export class LiveList<T> {
  readonly #fetch: () => Promise<T[]>;
  #run = 0;

  readonly items = signal<readonly T[] | null>(null);
  readonly error = signal<unknown>(null);
  /** La primera carga: una recarga conserva lo que hay y no vuelve a las siluetas. */
  readonly loading = computed(() => this.items() === null && this.error() === null);

  constructor(fetch: () => Promise<T[]>) {
    this.#fetch = fetch;
  }

  async refresh(): Promise<void> {
    const run = ++this.#run;

    try {
      const items = await this.#fetch();

      if (run === this.#run) {
        this.items.set(items);
        this.error.set(null);
      }
    } catch (error) {
      if (run === this.#run) {
        this.error.set(error);
      }
    }
  }

  /** Otro proyecto: lo que había ya no vale. */
  reset(): void {
    this.#run++;
    this.items.set(null);
    this.error.set(null);
  }
}
