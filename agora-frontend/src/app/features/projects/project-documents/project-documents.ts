import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorCode, apiErrorOutcome } from '../../../core/api/api-error';
import type { ApiErrorMessages, ApiErrorOutcome } from '../../../core/api/api-error';
import { DocumentsApi } from '../../../core/api/documents.api';
import type { ProjectDocument } from '../../../core/api/documents.types';
import { TasksApi } from '../../../core/api/tasks.api';
import type { Task } from '../../../core/api/tasks.types';
import { formatFileSize } from '../../../core/format/file-size';
import { formatMoment } from '../../../core/format/message-dates';
import { Button } from '../../../shared/ui/button/button';
import { Dialog } from '../../../shared/ui/dialog/dialog';
import { Empty } from '../../../shared/ui/empty/empty';
import { Notice, type NoticeTone } from '../../../shared/ui/notice/notice';
import { LoadingStatus, Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { DocumentUpload, type DocumentUploadRequest } from '../document-upload/document-upload';
import { LiveList } from '../live-list';
import { injectProjectContext, refreshOnLiveEvents } from '../project-context';
import { ProjectHeader } from '../project-header/project-header';
import { ProjectTabs } from '../project-tabs/project-tabs';
import { saveFile } from './save-file';

interface ScreenNotice {
  message: string;
  tone: NoticeTone;
}

const UPLOAD_MESSAGES: ApiErrorMessages = {
  NOT_FOUND: 'Esa tarea ya no existe en este proyecto. Elige otra.',
  CONFLICT: 'El proyecto se cerró y ya no admite cambios.',
};

/** Tampoco se distingue de un cierre: el backend responde `409` a los dos. */
const VERSION_CONFLICT =
  'No se subió: alguien subió otra versión de este documento o cerró el proyecto. Revisa la lista y vuelve a intentarlo.';

const DOWNLOAD_MESSAGES: ApiErrorMessages = {
  NOT_FOUND: 'El archivo de este documento ya no está disponible.',
};

const DELETE_MESSAGES: ApiErrorMessages = {
  NOT_FOUND: 'Esa versión ya no existe.',
  CONFLICT: 'El proyecto se cerró y ya no admite cambios.',
};

/**
 * Los documentos del proyecto: la última versión de cada cadena, que es lo que devuelve
 * la API, y la cadena se abre por documento. Subir y subir versión, cualquier miembro;
 * borrar, quien subió esa versión o el investigador principal; descargar, también la
 * coordinación. En un proyecto cerrado solo se lee y se descarga.
 */
@Component({
  selector: 'app-project-documents',
  imports: [
    Button,
    Dialog,
    DocumentUpload,
    Empty,
    LoadingStatus,
    Notice,
    ProjectHeader,
    ProjectTabs,
    RouterLink,
    Skeleton,
  ],
  templateUrl: './project-documents.html',
})
export class ProjectDocuments {
  readonly #api = inject(DocumentsApi);
  readonly #tasksApi = inject(TasksApi);

  protected readonly ctx = injectProjectContext();

  protected readonly documents = new LiveList<ProjectDocument>(() =>
    this.#api.list(this.ctx.projectId()),
  );
  readonly #tasks = new LiveList<Task>(() => this.#tasksApi.list(this.ctx.projectId()));

  /**
   * Las versiones de la cadena abierta. Se pide desde cualquiera de las que se conocían:
   * cualquiera puede haberse borrado, y un `404` de una no significa que la cadena no
   * exista. Si no queda ninguna, la cadena se fue.
   */
  #chainIds: readonly string[] = [];
  protected readonly chain = new LiveList<ProjectDocument>(async () => {
    for (const id of this.#chainIds) {
      try {
        return await this.#api.versions(this.ctx.projectId(), id);
      } catch (error) {
        if (apiErrorCode(error) !== 'NOT_FOUND') {
          throw error;
        }
      }
    }

    return [];
  });

  protected readonly taskOptions = computed(() =>
    (this.#tasks.items() ?? []).map(({ id, title }) => ({ id, title })),
  );

  readonly #titles = computed(
    () => new Map(this.taskOptions().map((task) => [task.id, task.title])),
  );

  protected readonly rows = computed(() =>
    (this.documents.items() ?? []).map((document) => ({
      document,
      details: this.details(document),
      task: document.taskId ? (this.#titles().get(document.taskId) ?? 'Una tarea') : null,
      chainOpen: this.chain.items()?.some((version) => version.id === document.id) ?? false,
    })),
  );

  protected readonly loading = computed(
    () => this.ctx.project.status() === 'loading' || this.documents.loading(),
  );

  /** `null` sin error, o si el interceptor ya lo resolvió. */
  protected readonly listError = computed(() => {
    const error = this.documents.error() ?? this.chain.error();

    if (!error) {
      return null;
    }

    const outcome = apiErrorOutcome(error);

    return outcome.kind === 'none' ? null : outcome.message;
  });

  // El formulario. `target` es una foto de la versión sobre la que se sube.
  protected readonly form = signal<{ target: ProjectDocument | null } | null>(null);
  protected readonly uploading = signal(false);
  protected readonly failure = signal<ApiErrorOutcome | null>(null);

  protected readonly notice = signal<ScreenNotice | null>(null);
  protected readonly downloading = signal<ReadonlySet<string>>(new Set());

  // Borrar. Se guarda el id: el aviso lee las listas, que se acaban de pedir.
  readonly #deleteId = signal<string | null>(null);
  protected readonly deleting = signal(false);

  protected readonly documentToDelete = computed(() => {
    const id = this.#deleteId();

    return (
      [...(this.documents.items() ?? []), ...(this.chain.items() ?? [])].find(
        (document) => document.id === id,
      ) ?? null
    );
  });

  /** Borrar la última hace que la anterior vuelva a serlo, y la lista cambia sin avisar. */
  protected readonly deleteWarning = computed(() => {
    const document = this.documentToDelete();

    if (!document) {
      return [];
    }

    const isLatest = this.documents.items()?.some((latest) => latest.id === document.id) ?? false;
    const consequence = !isLatest
      ? 'Las demás versiones siguen en la cadena, y sus números no cambian.'
      : document.previousVersionId
        ? 'Es la última versión: la anterior vuelve a ser la última, y es la que verá todo el equipo en la lista.'
        : 'Es la única versión: el documento desaparece de la lista.';

    return [consequence, 'El archivo se borra y no se puede recuperar.'];
  });

  constructor() {
    effect(() => {
      this.ctx.projectId();

      untracked(() => {
        this.documents.reset();
        this.#tasks.reset();
        this.#closeChain();
        this.form.set(null);
        this.notice.set(null);
        void this.documents.refresh();
        void this.#tasks.refresh();
      });
    });

    refreshOnLiveEvents(this.ctx, {
      documents: () => void this.#refreshAll(),
      // Borrar una tarea suelta sus documentos: el vínculo también cambió.
      tasks: () => {
        void this.#tasks.refresh();
        void this.#refreshAll();
      },
    });
  }

  protected details(document: ProjectDocument): string {
    return [
      `Versión ${document.version}`,
      formatFileSize(document.sizeBytes),
      document.uploadedBy.fullName,
      formatMoment(document.createdAt),
    ].join(' · ');
  }

  /** Lo mismo que comprueba el backend: quien la subió o el principal, en un proyecto abierto. */
  protected canDelete(document: ProjectDocument): boolean {
    return (
      this.ctx.canContribute() &&
      (document.uploadedById === this.ctx.userId() || this.ctx.canManage())
    );
  }

  protected openUpload(target: ProjectDocument | null): void {
    this.failure.set(null);
    this.form.set({ target });
  }

  protected closeForm(): void {
    this.form.set(null);
  }

  protected async upload({ file, taskId }: DocumentUploadRequest): Promise<void> {
    if (this.uploading()) {
      return;
    }

    const projectId = this.ctx.projectId();
    const target = this.form()?.target;

    this.uploading.set(true);
    this.failure.set(null);
    this.notice.set(null);

    try {
      await (target
        ? this.#api.uploadVersion(projectId, target.id, file)
        : this.#api.upload(projectId, file, taskId));
      this.form.set(null);
    } catch (error) {
      if (target && apiErrorCode(error) === 'CONFLICT') {
        // Esa versión ya no es la última: seguir en el formulario solo volvería a fallar.
        this.form.set(null);
        this.notice.set({ message: VERSION_CONFLICT, tone: 'block' });
        this.ctx.project.reload();
      } else {
        this.failure.set(apiErrorOutcome(error, UPLOAD_MESSAGES));

        if (apiErrorCode(error) === 'CONFLICT') {
          this.ctx.project.reload();
        }
      }
    } finally {
      this.uploading.set(false);
      await this.#refreshAll();
    }
  }

  protected toggleChain(document: ProjectDocument): void {
    if (this.chain.items()?.some((version) => version.id === document.id)) {
      this.#closeChain();
      return;
    }

    this.chain.reset();
    this.#chainIds = [document.id];
    void this.#refreshChain();
  }

  #closeChain(): void {
    this.#chainIds = [];
    this.chain.reset();
  }

  async #refreshChain(): Promise<void> {
    if (this.#chainIds.length === 0) {
      return;
    }

    await this.chain.refresh();

    const versions = this.chain.items();

    if (versions?.length === 0) {
      this.#closeChain();
    } else if (versions) {
      this.#chainIds = versions.map((version) => version.id);
    }
  }

  #refreshAll(): Promise<unknown> {
    return Promise.all([this.documents.refresh(), this.#refreshChain()]);
  }

  /** Con el nombre del backend, que lleva la extensión. El de la lista es el respaldo. */
  protected async download(document: ProjectDocument): Promise<void> {
    this.downloading.update((ids) => new Set(ids).add(document.id));
    this.notice.set(null);

    try {
      const { blob, name } = await this.#api.download(this.ctx.projectId(), document.id);

      saveFile(blob, name ?? document.name);
    } catch (error) {
      this.#showError(error, DOWNLOAD_MESSAGES);
    } finally {
      this.downloading.update((ids) => {
        const others = new Set(ids);

        others.delete(document.id);

        return others;
      });
    }
  }

  /** Se vuelven a pedir las listas: el aviso tiene que decir lo que pasará ahora. */
  protected askToDelete(document: ProjectDocument, dialog: Dialog): void {
    this.#deleteId.set(document.id);
    void this.#refreshAll();
    dialog.open();
  }

  protected async delete(dialog: Dialog): Promise<void> {
    const document = this.documentToDelete();

    if (!document) {
      dialog.close();
      return;
    }

    this.deleting.set(true);
    this.notice.set(null);

    try {
      await this.#api.remove(this.ctx.projectId(), document.id);
    } catch (error) {
      this.#showError(error, DELETE_MESSAGES);
    } finally {
      this.deleting.set(false);
      dialog.close();
      await this.#refreshAll();
    }
  }

  #showError(error: unknown, messages: ApiErrorMessages): void {
    const outcome = apiErrorOutcome(error, messages);

    if (apiErrorCode(error) === 'CONFLICT') {
      this.ctx.project.reload();
    }

    if (outcome.kind !== 'none') {
      this.notice.set({
        message: outcome.message,
        tone: apiErrorCode(error) === 'CONFLICT' ? 'block' : 'error',
      });
    }
  }
}
