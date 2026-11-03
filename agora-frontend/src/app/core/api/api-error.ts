import { HttpErrorResponse } from '@angular/common/http';
import { SessionEndedError } from '../session/session-ended.error';

/**
 * Copia de `ERROR_CODES` del backend (`middlewares/error-handler.ts`). Es contrato
 * público: el cliente decide a partir del `code`, nunca del `message`.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
  'ACCOUNT_DISABLED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** El envelope de error del backend: `{ error: { code, message, details? } }`. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: { field: string; message: string }[];
  };
}

const isErrorCode = (value: unknown): value is ErrorCode =>
  (ERROR_CODES as readonly unknown[]).includes(value);

/**
 * El `code` de una respuesta de error del backend, o `null` si no lo trae: una
 * caída de red (status 0) o cualquier respuesta que no sea el envelope.
 */
export const apiErrorCode = (error: unknown): ErrorCode | null => {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  const code: unknown = (error.error as Partial<ApiErrorBody> | null)?.error?.code;

  return isErrorCode(code) ? code : null;
};

/** Los errores por campo de un `VALIDATION_ERROR`, como `{ campo: mensaje }`. */
export const apiFieldErrors = (error: unknown): Record<string, string> => {
  if (!(error instanceof HttpErrorResponse)) {
    return {};
  }

  const details = (error.error as Partial<ApiErrorBody> | null)?.error?.details ?? [];

  // Si un campo trae varios mensajes, se muestra el primero.
  return details.reduce<Record<string, string>>(
    (fields, { field, message }) => ({ [field]: message, ...fields }),
    {},
  );
};

/**
 * Lo que la pantalla hace con un error de la API:
 *
 * - `fields`: un `VALIDATION_ERROR` con errores por campo. Cada uno va bajo su
 *   campo; `message` es el respaldo para la pantalla que no pudo colocar ninguno,
 *   porque el backend puede quejarse de un campo que el formulario no muestra.
 * - `message`: un aviso. `code` es `null` si no hubo respuesta del backend.
 * - `none`: el interceptor ya lo resolvió y navegó; la pantalla no muestra nada.
 */
export type ApiErrorOutcome =
  | { kind: 'fields'; fields: Record<string, string>; message: string }
  | { kind: 'message'; code: ErrorCode | null; message: string }
  | { kind: 'none' };

/** Texto que una acción pone en lugar del de por defecto, por código. */
export type ApiErrorMessages = Partial<Record<ErrorCode, string>>;

/**
 * Los textos por defecto, en un solo sitio. Los de los códigos que acaban en
 * `none` no se muestran nunca; están porque la tabla cubre los diez.
 */
const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Revisa los datos del formulario.',
  UNAUTHENTICATED: 'Tu sesión no está activa. Vuelve a iniciar sesión.',
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  TOKEN_EXPIRED: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  INVALID_TOKEN: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  ACCOUNT_DISABLED: 'Tu cuenta está desactivada. Comunícate con la coordinación de investigación.',
  FORBIDDEN: 'No tienes permiso para realizar esta acción.',
  // Nunca un texto que distinga los dos casos: confirmaría que el recurso existe,
  // que es justo lo que el backend esconde al responder 404 y no 403.
  NOT_FOUND: 'No existe o no tienes acceso.',
  CONFLICT: 'La acción no es posible en el estado actual.',
  INTERNAL_ERROR: 'Algo falló en el servidor. Inténtalo de nuevo en unos minutos.',
};

const NETWORK_MESSAGE = 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.';
const UNKNOWN_MESSAGE = 'Algo salió mal. Inténtalo de nuevo.';

/**
 * Los resuelve el interceptor, y la persona ve la resolución: `TOKEN_EXPIRED`
 * acaba en una renovación y `INVALID_TOKEN` en /sesion-expirada.
 *
 * `UNAUTHENTICATED` no está, aunque casi siempre signifique que la sesión ya
 * terminó: el interceptor no hace nada con él, y aquí `none` sería un botón que
 * no responde sin explicación. Si la sesión terminó, su aviso es exacto y el
 * guard saca a la persona en la siguiente navegación; si llegara con la sesión
 * viva, por un error nuestro, un aviso visible es mejor que el silencio.
 */
const RESOLVED_BY_INTERCEPTOR: readonly ErrorCode[] = ['TOKEN_EXPIRED', 'INVALID_TOKEN'];

/** El campo con que `validate` del backend marca un error de todo el objeto. */
const ROOT_FIELD = '(raíz)';

/**
 * Traduce un error cualquiera a lo que la pantalla debe hacer. No asume su forma:
 * lo que no sea una respuesta de la API acaba en un texto genérico, sin lanzar.
 *
 * `messages` cambia el texto de un código para una acción concreta, cuando tiene
 * algo más preciso que decir: un `CONFLICT` al cerrar un proyecto es que ya
 * estaba cerrado.
 */
export const apiErrorOutcome = (
  error: unknown,
  messages: ApiErrorMessages = {},
): ApiErrorOutcome => {
  // La renovación falló y el interceptor ya navegó a /sesion-expirada.
  if (error instanceof SessionEndedError) {
    return { kind: 'none' };
  }

  if (!(error instanceof HttpErrorResponse)) {
    return { kind: 'message', code: null, message: UNKNOWN_MESSAGE };
  }

  // Status 0: la petición no llegó al servidor, o no volvió.
  if (error.status === 0) {
    return { kind: 'message', code: null, message: NETWORK_MESSAGE };
  }

  const code = apiErrorCode(error);

  if (code === null) {
    return { kind: 'message', code: null, message: UNKNOWN_MESSAGE };
  }

  if (RESOLVED_BY_INTERCEPTOR.includes(code)) {
    return { kind: 'none' };
  }

  const message = messages[code] ?? DEFAULT_MESSAGES[code];

  if (code === 'VALIDATION_ERROR') {
    const { [ROOT_FIELD]: rootMessage, ...fields } = apiFieldErrors(error);

    // Un error de todo el objeto no tiene campo donde pintarse: es el aviso, y
    // dice más que el respaldo genérico.
    if (Object.keys(fields).length > 0) {
      return { kind: 'fields', fields, message: rootMessage ?? message };
    }

    return { kind: 'message', code, message: rootMessage ?? message };
  }

  return { kind: 'message', code, message };
};
