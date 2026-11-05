import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  resource,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { apiErrorOutcome } from '../../../core/api/api-error';
import { ProjectsApi } from '../../../core/api/projects.api';
import type { ProjectListItem, ProjectStatus } from '../../../core/api/projects.types';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { SessionService } from '../../../core/session/session.service';
import { Button } from '../../../shared/ui/button/button';
import { Empty } from '../../../shared/ui/empty/empty';
import { FieldInput } from '../../../shared/ui/field/field';
import { Notice } from '../../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { ProjectCard } from '../project-card/project-card';

const STATUS_FILTERS: { value: ProjectStatus | null; label: string }[] = [
  { value: null, label: 'Todos' },
  { value: 'PLANNING', label: 'En planeación' },
  { value: 'IN_PROGRESS', label: 'En ejecución' },
  { value: 'ON_HOLD', label: 'En pausa' },
  { value: 'COMPLETED', label: 'Finalizado' },
  { value: 'CANCELLED', label: 'Cancelado' },
];

const STATUSES = STATUS_FILTERS.flatMap(({ value }) => (value ? [value] : []));

const isStatus = (value: string | null): value is ProjectStatus =>
  STATUSES.includes(value as ProjectStatus);

/** Lo bastante para no pedir una página por tecla, y poco para que no se note. */
const SEARCH_DELAY_MS = 300;

/**
 * La lista de proyectos. La ve todo el mundo: qué proyectos aparecen lo decide el
 * backend con la regla de oro, no esta pantalla.
 *
 * **La URL es la única fuente de verdad** de `estado`, `buscar` y `pagina`. La
 * pantalla los lee del router y pinta en consecuencia; al cambiar un filtro
 * escribe la URL, y es eso lo que dispara la recarga. Así una recarga del
 * navegador, o el botón de volver, devuelven exactamente la misma lista.
 */
@Component({
  selector: 'app-project-list',
  imports: [Button, Empty, FieldInput, LoadingStatus, Notice, ProjectCard, Skeleton],
  templateUrl: './project-list.html',
  styleUrl: './project-list.css',
})
export class ProjectList {
  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute);
  readonly #api = inject(ProjectsApi);
  readonly #realtime = inject(RealtimeService);
  protected readonly session = inject(SessionService);
  protected readonly statusFilters = STATUS_FILTERS;

  readonly #params = toSignal(this.#route.queryParamMap, { requireSync: true });

  /** Lo que dice la URL, saneado: un estado o una página inválidos se ignoran. */
  protected readonly query = computed(() => {
    const params = this.#params();
    const estado = params.get('estado');
    const pagina = Number(params.get('pagina'));

    return {
      estado: isStatus(estado) ? estado : null,
      buscar: params.get('buscar') ?? '',
      pagina: Number.isInteger(pagina) && pagina > 1 ? pagina : 1,
    };
  });

  protected readonly projects = resource({
    params: () => this.query(),
    loader: ({ params }) =>
      this.#api.list({
        estado: params.estado ?? undefined,
        buscar: params.buscar,
        pagina: params.pagina,
      }),
  });

  #applyUnread(items: readonly ProjectListItem[]): void {
    for (const { id, unreadCount } of items) {
      this.#realtime.setUnread(id, unreadCount);
    }
  }

  /**
   * Fuera del `resource` a propósito: `reload()` pasa por `isLoading`, y volver a la
   * conexión pintaría las siluetas sobre una lista que no cambió. Si falla, se queda
   * la cifra que había.
   */
  async #refreshUnread(): Promise<void> {
    const { estado, buscar, pagina } = this.query();

    try {
      const page = await this.#api.list({ estado: estado ?? undefined, buscar, pagina });

      this.#applyUnread(page.items);
    } catch {
      return;
    }
  }

  protected readonly isCoordinator = computed(
    () => this.session.user()?.systemRole === 'COORDINATOR',
  );

  /** Una página más allá de la primera cuenta como filtro: vacía, se ofrece limpiarla. */
  protected readonly hasFilters = computed(() => {
    const { estado, buscar, pagina } = this.query();

    return estado !== null || buscar.trim() !== '' || pagina > 1;
  });

  /** `null` sin error, o si el interceptor ya lo resolvió y no hay nada que mostrar. */
  protected readonly errorMessage = computed(() => {
    const error = this.projects.error();

    if (!error) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  protected readonly page = computed(() =>
    this.projects.hasValue() ? this.projects.value() : null,
  );

  protected readonly countLabel = computed(() => {
    const total = this.page()?.total;

    return total === undefined ? '' : `${total} ${total === 1 ? 'proyecto' : 'proyectos'}`;
  });

  protected readonly pageCount = computed(() => {
    const page = this.page();

    return page ? Math.max(1, Math.ceil(page.total / page.perPage)) : 1;
  });

  #searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.#searchTimer));

    // La cifra de cada tarjeta sale de esta misma petición, no de una por tarjeta.
    effect(() => {
      const items = this.page()?.items ?? [];

      untracked(() => this.#applyUnread(items));
    });

    // Lo que llegó sin conexión el socket nunca lo entregó: solo el servidor lo sabe. La
    // primera conexión no cuenta: la lista acaba de pedir sus cifras.
    let lostConnection = false;

    this.#realtime.disconnected.pipe(takeUntilDestroyed()).subscribe(() => {
      lostConnection = true;
    });

    this.#realtime.connected.pipe(takeUntilDestroyed()).subscribe(() => {
      if (lostConnection) {
        lostConnection = false;
        void this.#refreshUnread();
      }
    });
  }

  /**
   * Teclear no llena el historial: se espera a que la persona pare y se
   * reemplaza la entrada actual. Lo escrito va a la URL tal cual; el cliente
   * tipado lo recorta al pedir.
   */
  protected search(value: string): void {
    clearTimeout(this.#searchTimer);
    this.#searchTimer = setTimeout(
      () => this.#navigate({ buscar: value || null, pagina: null }, true),
      SEARCH_DELAY_MS,
    );
  }

  /** Cambiar de estado sí entra en el historial, y vuelve a la primera página. */
  protected filterByStatus(estado: ProjectStatus | null): void {
    this.#navigate({ estado, pagina: null });
  }

  protected goToPage(pagina: number): void {
    this.#navigate({ pagina: pagina > 1 ? pagina : null });
  }

  protected clearFilters(): void {
    clearTimeout(this.#searchTimer);
    void this.#router.navigate([], { relativeTo: this.#route, queryParams: {} });
  }

  protected createProject(): void {
    void this.#router.navigate(['/proyectos/nuevo']);
  }

  /** `null` quita el parámetro de la URL; los demás se conservan. */
  #navigate(params: Record<string, string | number | null>, replaceUrl = false): void {
    void this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
}
