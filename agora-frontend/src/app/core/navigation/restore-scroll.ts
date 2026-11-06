import { ViewportScroller } from '@angular/common';
import { inject } from '@angular/core';
import { Router, Scroll } from '@angular/router';

/** Si para entonces la página no creció hasta ahí, es que ya no mide lo que medía. */
const GIVE_UP_MS = 5000;

const USER_MOVES = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

/**
 * Completa `scrollPositionRestoration`, que al volver atrás restaura la posición nada más
 * navegar: las pantallas piden sus datos después, así que la página aún es corta, el
 * navegador recorta y se queda arriba (medido: de 854 a 0). Aquí se espera a que la página
 * crezca hasta esa altura.
 *
 * Si la persona se mueve antes, manda ella: traerla de vuelta sería peor que no restaurar.
 */
export const restoreScrollOnceLoaded = (): void => {
  const scroller = inject(ViewportScroller);
  let stop = (): void => undefined;

  inject(Router).events.subscribe((event) => {
    if (!(event instanceof Scroll)) {
      return;
    }

    stop();

    const { position } = event;

    if (!position) {
      return;
    }

    const page = document.documentElement;
    const observer = new ResizeObserver(() => {
      if (page.scrollHeight - window.innerHeight >= position[1]) {
        scroller.scrollToPosition(position);
        stop();
      }
    });
    const timer = setTimeout(() => stop(), GIVE_UP_MS);

    stop = () => {
      observer.disconnect();
      clearTimeout(timer);
      USER_MOVES.forEach((move) => window.removeEventListener(move, stop));
    };

    observer.observe(page);
    USER_MOVES.forEach((move) => window.addEventListener(move, stop, { passive: true }));
  });
};
