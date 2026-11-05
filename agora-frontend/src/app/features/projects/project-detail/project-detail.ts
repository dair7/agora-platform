import {
  Component,
  type WritableSignal,
  computed,
  effect,
  inject,
  resource,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  apiErrorCode,
  apiErrorOutcome,
  type ApiErrorMessages,
  type ErrorCode,
} from '../../../core/api/api-error';
import { ProjectsApi } from '../../../core/api/projects.api';
import type { Member, ProjectRole } from '../../../core/api/projects.types';
import { formatBudget } from '../../../core/format/project-budget';
import { formatClosedAt, formatProjectPeriod } from '../../../core/format/project-dates';
import { formatProjectLead } from '../../../core/format/project-lead';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { SessionService } from '../../../core/session/session.service';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { Button } from '../../../shared/ui/button/button';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { Empty } from '../../../shared/ui/empty/empty';
import { Field, FieldInput, FieldSelect } from '../../../shared/ui/field/field';
import { Notice } from '../../../shared/ui/notice/notice';
import { PresencePill } from '../../../shared/ui/presence/presence';
import { ProjectStatusPill } from '../../../shared/ui/project-status/project-status';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { canManageProject } from '../project-permissions';
import { ProjectTabs } from '../project-tabs/project-tabs';

/** Un error de una acción, para el aviso de la página. `CONFLICT` va en el tono de bloqueo. */
interface ActionError {
  code: ErrorCode | null;
  message: string;
}

const CLOSE_MESSAGES: ApiErrorMessages = { CONFLICT: 'Este proyecto ya estaba cerrado.' };

const REMOVE_MESSAGES: ApiErrorMessages = {
  CONFLICT: 'No se puede retirar al investigador principal.',
};

const TRANSFER_MESSAGES: ApiErrorMessages = {
  NOT_FOUND: 'Esa persona ya no es miembro activo del proyecto.',
  FORBIDDEN: 'Ya no eres el investigador principal de este proyecto.',
  CONFLICT: 'El proyecto se cerró y ya no admite cambios.',
};

/**
 * `NOT_FOUND` rompe aquí, a propósito, la regla de que un 404 siempre dice «no
 * existe o no tienes acceso». Esa regla protege la existencia de un *proyecto*:
 * un 404 genérico impide confirmar que un identificador corresponde a uno real.
 * Este 404 responde a un correo que la persona acaba de escribir en un campo, y
 * contestarle «no existe o no tienes acceso» haría el formulario inusable.
 *
 * El costo es real: permite averiguar si un correo tiene cuenta. Es aceptable
 * porque solo puede hacerlo un investigador principal autenticado, desde su
 * propio proyecto.
 *
 * `CONFLICT` cubre dos casos que el backend no distingue —ya es miembro, o es la
 * coordinación—, y el cliente no adivina cuál fue.
 */
const ADD_MEMBER_MESSAGES: ApiErrorMessages = {
  NOT_FOUND: 'No hay ninguna cuenta activa con ese correo.',
  CONFLICT: 'Esa persona ya es miembro, o el correo es de la coordinación.',
};

/** Los errores del formulario de agregar que se dicen bajo el campo y no en un aviso. */
const ADD_MEMBER_FIELD_CODES: readonly (ErrorCode | null)[] = ['NOT_FOUND', 'CONFLICT'];

/**
 * Nombres de función y no de persona, como el rol del armazón: así no hay que
 * adivinar el género de nadie.
 */
const ROLE_LABELS: Record<ProjectRole, string> = {
  PRINCIPAL_INVESTIGATOR: 'Investigación principal',
  CO_INVESTIGATOR: 'Coinvestigación',
};

/** El backend permite guardar `""`; un bloque en blanco parecería un fallo de la pantalla. */
const textOrNull = (value: string | null): string | null => (value?.trim() ? value : null);

/**
 * El detalle de un proyecto: cabecera, resumen y miembros, con las acciones del
 * investigador principal —editar y cerrar el proyecto, agregar y retirar
 * miembros—. Las fases no se pintan: tienen su pestaña.
 */
@Component({
  selector: 'app-project-detail',
  imports: [
    Avatar,
    Button,
    Dialog,
    Empty,
    Field,
    FieldInput,
    FieldSelect,
    LoadingStatus,
    Notice,
    PresencePill,
    ProjectStatusPill,
    RouterLink,
    ProjectTabs,
    Skeleton,
  ],
  templateUrl: './project-detail.html',
})
export class ProjectDetail {
  readonly #api = inject(ProjectsApi);
  readonly #title = inject(Title);
  readonly #session = inject(SessionService);
  readonly #realtime = inject(RealtimeService);
  protected readonly roleLabels = ROLE_LABELS;

  readonly #params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });

  protected readonly project = resource({
    params: () => this.#params().get('projectId') ?? '',
    loader: ({ params }) => this.#api.get(params),
  });

  /**
   * Quién está en línea, o `null` si no se sabe: sin conexión, a la coordinación
   * (no entra a las salas), o a quien acaban de sumar al proyecto. Con `null` la
   * pantalla no muestra cuenta: una inventada es peor que ninguna.
   */
  protected readonly online = computed(() =>
    this.#realtime.presenceIn(this.#params().get('projectId') ?? ''),
  );

  /**
   * `NOT_FOUND` y `VALIDATION_ERROR` comparten pantalla y texto, a propósito.
   *
   * El 400 es un identificador mal formado en la URL: en una pantalla sin
   * formulario su error de campo no tiene dónde pintarse. Y para la persona, una
   * URL rota y el proyecto de otro son indistinguibles, y tienen que seguir
   * siéndolo: si la pantalla distinguiera los dos casos, estaría confirmando qué
   * identificadores corresponden a proyectos reales, que es justo lo que la regla
   * de oro esconde al responder 404 y no 403.
   */
  protected readonly notFound = computed(() => {
    const code = apiErrorCode(this.project.error());

    return code === 'NOT_FOUND' || code === 'VALIDATION_ERROR';
  });

  /** Cualquier otro error. `null` si no hay, o si el interceptor ya lo resolvió. */
  protected readonly errorMessage = computed(() => {
    const error = this.project.error();

    if (!error || this.notFound()) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  protected readonly view = computed(() => {
    if (!this.project.hasValue()) {
      return null;
    }

    const project = this.project.value();
    // El investigador principal va primero, explícitamente: no se confía en que
    // el orden por `joinedAt` lo deje arriba.
    const members = [...project.members].sort((a, b) => rank(a) - rank(b));
    const lead = members.find((m) => m.role === 'PRINCIPAL_INVESTIGATOR');

    return {
      project,
      members,
      lead: formatProjectLead(lead?.user.fullName ?? null, members.length),
      period: formatProjectPeriod(project.startDate, project.endDate),
      closedAt:
        project.status === 'COMPLETED' && project.closedAt
          ? formatClosedAt(project.closedAt)
          : null,
      description: textOrNull(project.description),
      objectives: textOrNull(project.objectives),
      budget: formatBudget(project.budget),
    };
  });

  /**
   * Nadie ve un botón que el backend le negaría: no se pinta deshabilitado, no se
   * pinta. Cubre editar, cerrar, agregar y retirar; la regla está en
   * `canManageProject`.
   *
   * Con el proyecto cerrado se esconden también agregar y retirar, pero es
   * comodidad, no seguridad: hoy el backend no los bloquea en un proyecto
   * `COMPLETED` (hueco anotado para la fase 11).
   */
  protected readonly canManage = computed(() => {
    const view = this.view();

    return view !== null && canManageProject(view.project, this.#session.user()?.id);
  });

  /**
   * La conversación es de los miembros. La coordinación ve el proyecto pero no
   * participa de su chat, así que tampoco ve el enlace.
   */
  protected readonly canChat = computed(() => {
    const me = this.#session.user()?.id;

    return this.view()?.members.some((m) => m.user.id === me) ?? false;
  });

  /** El error de la última acción de cerrar o retirar; se limpia al empezar otra. */
  protected readonly actionError = signal<ActionError | null>(null);

  // Cerrar el proyecto.
  protected readonly closing = signal(false);

  protected async closeProject(dialog: Dialog): Promise<void> {
    await this.#runInDialog(dialog, this.closing, CLOSE_MESSAGES, (id) => this.#api.close(id));
  }

  // Retirar un miembro. La persona elegida da el texto del diálogo.
  protected readonly memberToRemove = signal<Member | null>(null);
  protected readonly removing = signal(false);

  protected askToRemove(member: Member, dialog: Dialog): void {
    this.memberToRemove.set(member);
    dialog.open();
  }

  protected async removeMember(dialog: Dialog): Promise<void> {
    const member = this.memberToRemove();

    if (member) {
      await this.#runInDialog(dialog, this.removing, REMOVE_MESSAGES, (id) =>
        this.#api.removeMember(id, member.user.id),
      );
    }
  }

  // El relevo. Solo a un miembro activo: el backend rechaza a cualquier otro.
  protected readonly leadCandidates = computed(
    () =>
      this.view()?.members.filter(
        (member) => member.role === 'CO_INVESTIGATOR' && member.user.isActive,
      ) ?? [],
  );
  protected readonly newLeadId = signal('');
  protected readonly transferring = signal(false);

  protected askToTransfer(dialog: Dialog): void {
    this.newLeadId.set('');
    dialog.open();
  }

  protected async transferLead(dialog: Dialog): Promise<void> {
    const userId = this.newLeadId();

    if (userId) {
      await this.#runInDialog(dialog, this.transferring, TRANSFER_MESSAGES, (id) =>
        this.#api.transferLead(id, userId),
      );
    }
  }

  // Agregar un miembro. Sin diálogo: no es destructivo.
  protected readonly newMemberEmail = signal('');
  protected readonly adding = signal(false);
  /** El error que va bajo el campo de correo. */
  protected readonly addFieldError = signal<string | null>(null);
  /** El que no tiene que ver con el correo (red, servidor), en un aviso. */
  protected readonly addError = signal<string | null>(null);

  protected async addMember(event: Event): Promise<void> {
    event.preventDefault();
    const project = this.view()?.project;

    // El botón ya se deshabilita con el correo en blanco, y con el botón de envío
    // deshabilitado Enter no envía el formulario; esto es solo la red de seguridad.
    if (!project || this.adding() || this.newMemberEmail().trim() === '') {
      return;
    }

    this.adding.set(true);
    this.addFieldError.set(null);
    this.addError.set(null);

    try {
      await this.#api.addMember(project.id, { email: this.newMemberEmail() });
      this.newMemberEmail.set('');
      this.project.reload();
    } catch (error) {
      const outcome = apiErrorOutcome(error, ADD_MEMBER_MESSAGES);

      if (outcome.kind === 'fields') {
        // El único campo es el correo; cualquier otro detalle cae en el respaldo.
        this.addFieldError.set(outcome.fields['email'] ?? outcome.message);
      } else if (outcome.kind === 'message') {
        if (ADD_MEMBER_FIELD_CODES.includes(outcome.code)) {
          this.addFieldError.set(outcome.message);
        } else {
          this.addError.set(outcome.message);
        }
      }
    } finally {
      this.adding.set(false);
    }
  }

  /**
   * La acción confirmada en un diálogo: con éxito, cierra el diálogo y recarga el
   * proyecto. No hay aviso de éxito: la pantalla cambia sola, y eso dice más que un
   * mensaje. Con error, cierra igual, recarga —lo que mostraba la pantalla quedó
   * viejo— y deja el mensaje en un aviso.
   */
  async #runInDialog(
    dialog: Dialog,
    busy: WritableSignal<boolean>,
    messages: ApiErrorMessages,
    action: (projectId: string) => Promise<unknown>,
  ): Promise<void> {
    const project = this.view()?.project;

    if (!project || busy()) {
      return;
    }

    busy.set(true);
    this.actionError.set(null);

    try {
      await action(project.id);
    } catch (error) {
      const outcome = apiErrorOutcome(error, messages);

      if (outcome.kind !== 'none') {
        this.actionError.set({
          code: outcome.kind === 'message' ? outcome.code : 'VALIDATION_ERROR',
          message: outcome.message,
        });
      }
    } finally {
      busy.set(false);
      dialog.close();
      this.project.reload();
    }
  }

  constructor() {
    // El título de la ruta es «Proyecto · Ágora» mientras carga; con el proyecto
    // en la mano pasa a llevar su nombre.
    effect(() => {
      const view = this.view();

      if (view) {
        this.#title.setTitle(`${view.project.title} · Ágora`);
      }
    });
  }
}

const rank = (member: Member): number => (member.role === 'PRINCIPAL_INVESTIGATOR' ? 0 : 1);
