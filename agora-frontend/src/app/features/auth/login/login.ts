import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorCode, apiFieldErrors } from '../../../core/api/api-error';
import { SessionService } from '../../../core/session/session.service';

type LoginField = 'email' | 'password';

type SampleStatus = 'ejecucion' | 'planeacion' | 'cierre';

/**
 * Contenido de muestra de la tarjeta de cristal: enseña el producto antes de
 * entrar. Es fijo a propósito y no viene de la API; no hay sesión con qué pedirlo.
 * Las fechas llevan su contexto («Entrega», «Inicia», «Cerrado»): una fecha sola
 * no dice si es un plazo o algo que ya pasó.
 */
const SAMPLE_PROJECTS: readonly {
  title: string;
  lead: string;
  members: number;
  date: string;
  status: SampleStatus;
  progress: number;
  news?: number;
}[] = [
  {
    title: 'Metales pesados en la Ciénaga de la Virgen',
    lead: 'Laura Mendoza',
    members: 3,
    date: 'Entrega 14 nov',
    status: 'ejecucion',
    progress: 64,
    news: 4,
  },
  {
    title: 'Movilidad urbana en el centro histórico',
    lead: 'Carlos Beltrán',
    members: 2,
    date: 'Inicia 2 dic',
    status: 'planeacion',
    progress: 15,
  },
  {
    title: 'Deserción estudiantil en ingeniería',
    lead: 'Carlos Beltrán',
    members: 2,
    date: 'Cerrado 4 sep',
    status: 'cierre',
    progress: 100,
  },
];

/** Los avatares apilados de quien está conectado, en la cabecera de la tarjeta. */
const SAMPLE_PEOPLE: readonly { initials: string; classes: string }[] = [
  { initials: 'LM', classes: 'bg-veril text-tinta-inversa' },
  { initials: 'CB', classes: 'bg-estado-planeacion text-tinta' },
  { initials: 'AP', classes: 'bg-tinta text-tinta-inversa' },
];

// Las tres profundidades del sistema: la píldora y la barra de avance llevan el
// color del estado; el texto de la píldora dice el estado sin depender del color.
const STATUS: Record<SampleStatus, { label: string; pill: string; bar: string }> = {
  ejecucion: {
    label: 'En ejecución',
    pill: 'bg-estado-ejecucion text-tinta-inversa',
    bar: 'bg-estado-ejecucion',
  },
  planeacion: {
    label: 'En planeación',
    pill: 'bg-estado-planeacion text-tinta',
    bar: 'bg-estado-planeacion',
  },
  cierre: {
    label: 'Finalizado',
    pill: 'bg-estado-cierre text-tinta-inversa',
    bar: 'bg-estado-cierre',
  },
};

// TODO(backend): «Recordarme» y «¿Olvidaste tu contraseña?» están en la pantalla
// porque los trae la maqueta, pero son inertes: la casilla no está enlazada a
// nada y el enlace solo pone #recuperar en la dirección. No hay recuperación de
// contraseña en el backend, y «recordarme» exigiría otra duración del refresh
// token. Se conectan cuando el backend los tenga; no inventarlos aquí.
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  readonly #session = inject(SessionService);
  readonly #router = inject(Router);

  protected readonly sampleProjects = SAMPLE_PROJECTS;
  protected readonly samplePeople = SAMPLE_PEOPLE;
  protected readonly status = STATUS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: [''],
    password: [''],
  });

  protected readonly submitting = signal(false);
  /** El ojo del campo de contraseña: muestra u oculta lo escrito. */
  protected readonly showPassword = signal(false);
  /** Errores de la sesión, para la alerta: no son de un campo concreto. */
  protected readonly notice = signal<string | null>(null);
  /** Errores de cada campo, debajo del campo. */
  protected readonly fieldErrors = signal<Partial<Record<LoginField, string>>>({});

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }

    const { email, password } = this.form.getRawValue();

    // Solo lo que se sabe sin preguntar al servidor: que no vengan vacíos. El
    // formato del correo lo valida el backend, y su mensaje llega por `details`.
    const missing: Partial<Record<LoginField, string>> = {};
    if (!email.trim()) missing.email = 'Escribe tu correo.';
    if (!password) missing.password = 'Escribe tu contraseña.';

    this.notice.set(null);
    this.fieldErrors.set(missing);
    if (Object.keys(missing).length > 0) {
      return;
    }

    this.submitting.set(true);
    try {
      await this.#session.login({ email, password });
      await this.#router.navigateByUrl('/inicio');
    } catch (error) {
      this.#showError(error);
    } finally {
      this.submitting.set(false);
    }
  }

  /** Se decide por el `code`, nunca por el `message`. */
  #showError(error: unknown): void {
    switch (apiErrorCode(error)) {
      case 'VALIDATION_ERROR':
        this.fieldErrors.set(apiFieldErrors(error));
        return;
      case 'INVALID_CREDENTIALS':
        this.notice.set('El correo o la contraseña no coinciden. Revísalos e inténtalo de nuevo.');
        return;
      case 'ACCOUNT_DISABLED':
        this.notice.set('Esta cuenta está desactivada. Pide a la coordinación que la active.');
        return;
      default:
        this.notice.set(
          error instanceof HttpErrorResponse && error.status === 0
            ? 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.'
            : 'Algo falló en el servidor. Inténtalo de nuevo en un momento.',
        );
    }
  }
}
