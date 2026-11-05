import { DestroyRef, computed, inject, resource } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type { Observable } from 'rxjs';
import { apiErrorCode, apiErrorOutcome } from '../../core/api/api-error';
import { ProjectsApi } from '../../core/api/projects.api';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { SessionService } from '../../core/session/session.service';
import { canManageProject } from './project-permissions';

/**
 * Lo que comparten las pantallas colgadas de un proyecto: de qué proyecto se trata, si
 * existe para quien mira y qué puede hacer. Se llama en el contexto de inyección.
 */
export const injectProjectContext = () => {
  const api = inject(ProjectsApi);
  const session = inject(SessionService);
  const params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });

  const projectId = computed(() => params().get('projectId') ?? '');
  const userId = computed(() => session.user()?.id);

  const project = resource({
    params: () => projectId(),
    loader: ({ params: id }) => api.get(id),
  });

  const view = computed(() => (project.hasValue() ? project.value() : null));

  /** Un proyecto ajeno y una URL rota son la misma pantalla: ver el detalle. */
  const notFound = computed(() => {
    const code = apiErrorCode(project.error());

    return code === 'NOT_FOUND' || code === 'VALIDATION_ERROR';
  });

  const errorMessage = computed(() => {
    const error = project.error();

    if (!error || notFound()) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  /** Nadie ve un botón que el backend le negaría: ver `canManageProject`. */
  const canManage = computed(() => {
    const current = view();

    return current !== null && canManageProject(current, userId());
  });

  /** La conversación es de los miembros: la coordinación ve el proyecto, no su chat. */
  const isMember = computed(
    () => view()?.members.some((member) => member.user.id === userId()) ?? false,
  );

  /** Escribir lo propio: registrar avances y subir documentos. En un cierre, nadie. */
  const canContribute = computed(() => isMember() && view()?.status !== 'COMPLETED');

  return {
    projectId,
    userId,
    project,
    view,
    notFound,
    errorMessage,
    canManage,
    isMember,
    canContribute,
  };
};

export type ProjectContext = ReturnType<typeof injectProjectContext>;

/** Lo que una pantalla vuelve a pedir. Solo dice lo que muestra. */
export interface LiveRefresh {
  schedule?: () => void;
  tasks?: () => void;
  progress?: () => void;
  documents?: () => void;
}

/**
 * Vuelve a pedir lo que muestra la pantalla cuando llega un evento de este proyecto, y
 * tras una reconexión: lo que pasó sin conexión el socket nunca lo entregó.
 *
 * A la coordinación no le llega ninguno, y es una decisión: en las salas de proyecto, la
 * presencia la anunciaría en proyectos de los que no es miembro. Su vista es una foto.
 */
export const refreshOnLiveEvents = (context: ProjectContext, refresh: LiveRefresh): void => {
  const realtime = inject(RealtimeService);
  const destroyRef = inject(DestroyRef);
  let lostConnection = false;

  const follow = (changes: Observable<string>, run?: () => void): void => {
    changes.pipe(takeUntilDestroyed(destroyRef)).subscribe((projectId) => {
      if (projectId === context.projectId()) {
        run?.();
      }
    });
  };

  follow(realtime.scheduleChanged, refresh.schedule);
  follow(realtime.tasksChanged, refresh.tasks);
  follow(realtime.progressChanged, refresh.progress);
  follow(realtime.documentsChanged, refresh.documents);

  realtime.disconnected.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
    lostConnection = true;
  });

  realtime.connected.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
    if (lostConnection) {
      lostConnection = false;
      refresh.schedule?.();
      refresh.tasks?.();
      refresh.progress?.();
      refresh.documents?.();
    }
  });
};
