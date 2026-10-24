import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorCode, apiFieldErrors } from '../../../core/api/api-error';
import { SessionService } from '../../../core/session/session.service';
import { Button } from '../../../shared/ui/button/button';
import { Field, FieldInput } from '../../../shared/ui/field/field';
import { Notice } from '../../../shared/ui/notice/notice';

type LoginField = 'email' | 'password';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, Button, Field, FieldInput, Notice],
  templateUrl: './login.html',
})
export class Login {
  readonly #session = inject(SessionService);
  readonly #router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: [''],
    password: [''],
  });

  protected readonly submitting = signal(false);
  /** Errores de la sesión, para el Aviso: no son de un campo concreto. */
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
