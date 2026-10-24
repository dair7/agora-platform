import { HttpErrorResponse } from '@angular/common/http';

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
