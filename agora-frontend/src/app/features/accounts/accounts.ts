import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountsApi } from '../../core/api/accounts.api';
import {
  type ApiErrorMessages,
  type ApiErrorOutcome,
  apiErrorOutcome,
} from '../../core/api/api-error';
import { UsersApi } from '../../core/api/users.api';
import type { UserSummary } from '../../core/api/users.types';
import { SessionService } from '../../core/session/session.service';
import type { SystemRole } from '../../core/session/session.types';
import { Button } from '../../shared/ui/button/button';
import { Dialog } from '../../shared/ui/dialog/dialog';
import { Empty } from '../../shared/ui/empty/empty';
import { Field, FieldInput } from '../../shared/ui/field/field';
import { Notice } from '../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../shared/ui/skeleton/skeleton';
import { generatePassword } from './generate-password';
import { GeneratedPassword } from './generated-password';

const ROLE_FILTERS: { value: SystemRole | null; label: string }[] = [
  { value: null, label: 'Todas' },
  { value: 'COORDINATOR', label: 'Coordinación' },
  { value: 'RESEARCHER', label: 'Investigación' },
];

/** Nombres de área y no de persona: el sistema no sabe cómo se nombra cada quien. */
const ROLE_LABELS: Record<SystemRole, string> = {
  COORDINATOR: 'Coordinación',
  RESEARCHER: 'Investigación',
};

const isRole = (value: string | null): value is SystemRole =>
  value === 'COORDINATOR' || value === 'RESEARCHER';

/** Lo bastante para no pedir una lista por tecla, y poco para que no se note. */
const SEARCH_DELAY_MS = 300;

// Las mismas reglas del backend (`auth.schema.ts`): el cliente las comprueba para no
// gastar una petición, pero la última palabra es del servidor.
const NAME_MIN = 3;
const NAME_MAX = 150;
const EMAIL_MAX = 255;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAME_ERROR = `El nombre debe tener entre ${NAME_MIN} y ${NAME_MAX} caracteres.`;

// Los textos por acción. Nunca se muestra el `message` del backend ni el código: el
// cliente decide por el `code`, y aquí dice qué hacer.
const CREATE_MESSAGES: ApiErrorMessages = {
  CONFLICT: 'Ya hay una cuenta con ese correo.',
};
const RENAME_MESSAGES: ApiErrorMessages = {
  NOT_FOUND: 'La cuenta ya no existe. Se actualizó la lista.',
};
const RESET_MESSAGES: ApiErrorMessages = {
  CONFLICT: 'No puedes restablecer tu propia contraseña.',
  NOT_FOUND: 'La cuenta ya no existe. Se actualizó la lista.',
};
// El `409` de la baja no distingue entre sus dos causas posibles, y el texto cubre ambas.
// Tampoco puede decirle a la coordinación que traspase ella: el relevo y el cierre son de
// la investigación principal.
const DEACTIVATE_MESSAGES: ApiErrorMessages = {
  CONFLICT:
    'No se pudo desactivar. Lo más probable es que esta persona dirija proyectos abiertos: pídele que traspase la investigación principal o cierre esos proyectos, y vuelve a intentarlo. Si no, la cuenta ya estaba desactivada y la lista se actualizó.',
  NOT_FOUND: 'La cuenta ya no existe. Se actualizó la lista.',
};
const REACTIVATE_MESSAGES: ApiErrorMessages = {
  CONFLICT: 'La cuenta ya estaba activa. Se actualizó la lista.',
  NOT_FOUND: 'La cuenta ya no existe. Se actualizó la lista.',
};

/** Lo que cada diálogo necesita saber de su acción en curso. */
const dialogState = () => ({
  busy: signal(false),
  notice: signal<string | null>(null),
  fields: signal<Record<string, string>>({}),
});

/** Una contraseña generada, con la persona a quien pertenece. Solo vive en memoria. */
interface Credential {
  password: string;
  person: string;
}

/**
 * Cuentas, solo para la coordinación. Lista, busca, filtra, crea, renombra, restablece la
 * contraseña, desactiva y reactiva.
 *
 * **La URL es la única fuente de verdad** de `buscar`, `rol` y `desactivadas`, como en la
 * lista de proyectos: una recarga o el botón de volver devuelven la misma lista.
 *
 * **Nadie escribe una contraseña.** Al crear y al restablecer la genera el cliente, el
 * backend la recibe en el cuerpo y no vuelve a existir en ninguna respuesta; la pantalla la
 * muestra una vez, en el diálogo, y la borra al cerrarlo, sea cual sea la vía por la que se
 * cierre. No se guarda en el almacenamiento, ni en la URL, ni se escribe en la consola.
 */
@Component({
  selector: 'app-accounts',
  imports: [
    Button,
    Dialog,
    Empty,
    Field,
    FieldInput,
    GeneratedPassword,
    LoadingStatus,
    Notice,
    Skeleton,
  ],
  templateUrl: './accounts.html',
  styleUrl: './accounts.css',
})
export class Accounts {
  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute);
  readonly #users = inject(UsersApi);
  readonly #accounts = inject(AccountsApi);
  protected readonly session = inject(SessionService);

  protected readonly roleFilters = ROLE_FILTERS;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly nameMax = NAME_MAX;
  protected readonly emailMax = EMAIL_MAX;

  readonly #params = toSignal(this.#route.queryParamMap, { requireSync: true });

  protected readonly query = computed(() => {
    const params = this.#params();
    const rol = params.get('rol');

    return {
      buscar: params.get('buscar') ?? '',
      rol: isRole(rol) ? rol : null,
      desactivadas: params.get('desactivadas') === 'true',
    };
  });

  protected readonly accounts = resource({
    params: () => this.query(),
    loader: ({ params }) =>
      this.#users.list({
        rol: params.rol ?? undefined,
        buscar: params.buscar,
        incluirInactivas: params.desactivadas,
      }),
  });

  /**
   * Con datos mientras recarga: tras cada acción la lista se vuelve a pedir, y cambiarla
   * por siluetas sacaría la fila de debajo del cursor y del foco.
   */
  protected readonly list = computed(() =>
    this.accounts.hasValue() ? this.accounts.value() : null,
  );

  protected readonly loading = computed(() => this.accounts.status() === 'loading');

  protected readonly errorMessage = computed(() => {
    const error = this.accounts.error();

    if (!error) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  protected readonly countLabel = computed(() => {
    const total = this.list()?.length;

    return total === undefined ? '' : `${total} ${total === 1 ? 'cuenta' : 'cuentas'}`;
  });

  protected readonly hasFilters = computed(() => {
    const { buscar, rol, desactivadas } = this.query();

    return buscar.trim() !== '' || rol !== null || desactivadas;
  });

  /** Un aviso de la pantalla, no de un diálogo: lo que falló sin diálogo, como reactivar. */
  protected readonly pageNotice = signal<string | null>(null);
  protected readonly reactivatingId = signal<string | null>(null);

  // Crear.
  protected readonly creation = dialogState();
  protected readonly newName = signal('');
  protected readonly newEmail = signal('');
  protected readonly created = signal<Credential | null>(null);

  // Editar el nombre.
  protected readonly renaming = dialogState();
  protected readonly renameTarget = signal<UserSummary | null>(null);
  protected readonly renameValue = signal('');

  // Restablecer la contraseña.
  protected readonly reset = dialogState();
  protected readonly resetTarget = signal<UserSummary | null>(null);
  protected readonly resetDone = signal<Credential | null>(null);

  // Desactivar.
  protected readonly deactivation = dialogState();
  protected readonly deactivateTarget = signal<UserSummary | null>(null);

  private readonly listRegion = viewChild<ElementRef<HTMLElement>>('listRegion');
  #refocusList = false;
  #searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.#searchTimer));

    // Una baja puede quitar la fila que tenía el foco. El diálogo se lo devolvió al botón
    // que lo abrió, y cuando la lista se actualiza ese botón ya no existe: el foco caería
    // al principio de la página. Se lleva a la lista, que es donde la persona estaba.
    effect(() => {
      this.list();

      untracked(() => {
        if (this.#refocusList && !this.accounts.isLoading()) {
          this.#refocusList = false;

          if (!this.listRegion()?.nativeElement.contains(document.activeElement)) {
            this.listRegion()?.nativeElement.focus();
          }
        }
      });
    });
  }

  protected isSelf(account: UserSummary): boolean {
    return account.id === this.session.user()?.id;
  }

  // --- Filtros -----------------------------------------------------------------------

  /** Teclear no llena el historial: se espera a que la persona pare. */
  protected search(value: string): void {
    clearTimeout(this.#searchTimer);
    this.#searchTimer = setTimeout(
      () => this.#navigate({ buscar: value || null }, true),
      SEARCH_DELAY_MS,
    );
  }

  protected filterByRole(rol: SystemRole | null): void {
    this.#navigate({ rol });
  }

  protected toggleInactive(shown: boolean): void {
    this.#navigate({ desactivadas: shown ? 'true' : null });
  }

  protected clearFilters(): void {
    clearTimeout(this.#searchTimer);
    void this.#router.navigate([], { relativeTo: this.#route, queryParams: {} });
  }

  // --- Crear -------------------------------------------------------------------------

  protected openCreate(dialog: Dialog): void {
    this.newName.set('');
    this.newEmail.set('');
    this.#clear(this.creation);
    dialog.open();
  }

  /** El mismo botón confirma el formulario y, con la cuenta ya creada, cierra el diálogo. */
  protected confirmCreate(dialog: Dialog): void {
    if (this.created()) {
      dialog.close();
    } else {
      void this.submitCreate();
    }
  }

  protected async submitCreate(): Promise<void> {
    if (this.creation.busy()) {
      return;
    }

    const fullName = this.newName().trim();
    const email = this.newEmail().trim().toLowerCase();
    const fields: Record<string, string> = {};

    if (fullName.length < NAME_MIN || fullName.length > NAME_MAX) {
      fields['fullName'] = NAME_ERROR;
    }

    if (!EMAIL_FORMAT.test(email) || email.length > EMAIL_MAX) {
      fields['email'] = 'Escribe un correo válido.';
    }

    this.creation.notice.set(null);
    this.creation.fields.set(fields);

    if (Object.keys(fields).length > 0) {
      return;
    }

    this.creation.busy.set(true);

    try {
      const password = generatePassword();

      await this.#accounts.create({ email, password, fullName });

      this.created.set({ password, person: fullName });
      void this.accounts.reload();
    } catch (error) {
      this.#show(this.creation, apiErrorOutcome(error, CREATE_MESSAGES), ['fullName', 'email'], {
        CONFLICT: 'email',
      });
    } finally {
      this.creation.busy.set(false);
    }
  }

  /** Cerrado por la vía que sea: la contraseña no sobrevive al diálogo. */
  protected clearCreated(): void {
    this.created.set(null);
    this.newName.set('');
    this.newEmail.set('');
  }

  // --- Editar el nombre --------------------------------------------------------------

  protected openRename(account: UserSummary, dialog: Dialog): void {
    this.renameTarget.set(account);
    this.renameValue.set(account.fullName);
    this.#clear(this.renaming);
    dialog.open();
  }

  protected async submitRename(dialog: Dialog): Promise<void> {
    const target = this.renameTarget();

    if (!target || this.renaming.busy()) {
      return;
    }

    const fullName = this.renameValue().trim();

    this.renaming.notice.set(null);

    if (fullName.length < NAME_MIN || fullName.length > NAME_MAX) {
      this.renaming.fields.set({ fullName: NAME_ERROR });
      return;
    }

    this.renaming.fields.set({});

    // Sin cambios no hay nada que pedir.
    if (fullName === target.fullName) {
      dialog.close();
      return;
    }

    this.renaming.busy.set(true);

    try {
      await this.#users.rename(target.id, fullName);
      dialog.close();
      void this.accounts.reload();
    } catch (error) {
      this.#show(this.renaming, apiErrorOutcome(error, RENAME_MESSAGES), ['fullName']);
      void this.accounts.reload();
    } finally {
      this.renaming.busy.set(false);
    }
  }

  // --- Restablecer la contraseña -----------------------------------------------------

  protected openReset(account: UserSummary, dialog: Dialog): void {
    this.resetTarget.set(account);
    this.resetDone.set(null);
    this.#clear(this.reset);
    dialog.open();
  }

  protected confirmReset(dialog: Dialog): void {
    if (this.resetDone()) {
      dialog.close();
    } else {
      void this.submitReset();
    }
  }

  protected async submitReset(): Promise<void> {
    const target = this.resetTarget();

    if (!target || this.reset.busy()) {
      return;
    }

    this.reset.busy.set(true);
    this.reset.notice.set(null);

    try {
      const password = generatePassword();

      await this.#users.resetPassword(target.id, password);

      this.resetDone.set({ password, person: target.fullName });
    } catch (error) {
      this.#show(this.reset, apiErrorOutcome(error, RESET_MESSAGES), []);
      void this.accounts.reload();
    } finally {
      this.reset.busy.set(false);
    }
  }

  protected clearReset(): void {
    this.resetDone.set(null);
    this.resetTarget.set(null);
  }

  // --- Desactivar y reactivar --------------------------------------------------------

  protected openDeactivate(account: UserSummary, dialog: Dialog): void {
    this.deactivateTarget.set(account);
    this.#clear(this.deactivation);
    dialog.open();
  }

  protected async submitDeactivate(dialog: Dialog): Promise<void> {
    const target = this.deactivateTarget();

    if (!target || this.deactivation.busy()) {
      return;
    }

    this.deactivation.busy.set(true);
    this.deactivation.notice.set(null);

    try {
      await this.#users.deactivate(target.id);
      this.#refocusList = true;
      dialog.close();
      void this.accounts.reload();
    } catch (error) {
      // El diálogo se queda abierto con el motivo. La lista se actualiza igual: si el error
      // fue que ya estaba desactivada, lo que se veía estaba viejo.
      this.#show(this.deactivation, apiErrorOutcome(error, DEACTIVATE_MESSAGES), []);
      void this.accounts.reload();
    } finally {
      this.deactivation.busy.set(false);
    }
  }

  protected async reactivate(account: UserSummary): Promise<void> {
    if (this.reactivatingId()) {
      return;
    }

    this.reactivatingId.set(account.id);
    this.pageNotice.set(null);

    try {
      await this.#users.reactivate(account.id);
    } catch (error) {
      const outcome = apiErrorOutcome(error, REACTIVATE_MESSAGES);

      if (outcome.kind !== 'none') {
        this.pageNotice.set(outcome.message);
      }
    } finally {
      this.reactivatingId.set(null);
      void this.accounts.reload();
    }
  }

  // --- Ayudas ------------------------------------------------------------------------

  #clear(state: ReturnType<typeof dialogState>): void {
    state.notice.set(null);
    state.fields.set({});
  }

  /**
   * Un error de la API dentro de un diálogo. Los de campo van bajo su campo, pero solo los
   * que el formulario muestra (`known`): el backend puede quejarse de uno que no está, y
   * sin aviso la persona vería que no pasa nada. `fieldFor` manda un código que no es de
   * validación a un campo: el correo repetido es un `409`, y el formulario lo dice bajo el
   * correo.
   */
  #show(
    state: ReturnType<typeof dialogState>,
    outcome: ApiErrorOutcome,
    known: readonly string[],
    fieldFor: Partial<Record<string, string>> = {},
  ): void {
    if (outcome.kind === 'fields') {
      const shown = Object.fromEntries(
        Object.entries(outcome.fields).filter(([field]) => known.includes(field)),
      );

      if (Object.keys(shown).length > 0) {
        state.fields.set(shown);
      } else {
        state.notice.set(outcome.message);
      }
    } else if (outcome.kind === 'message') {
      const field = outcome.code ? fieldFor[outcome.code] : undefined;

      if (field) {
        state.fields.set({ [field]: outcome.message });
      } else {
        state.notice.set(outcome.message);
      }
    }
  }

  /** `null` quita el parámetro de la URL; los demás se conservan. */
  #navigate(params: Record<string, string | null>, replaceUrl = false): void {
    void this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
}
