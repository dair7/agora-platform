import { HttpErrorResponse } from '@angular/common/http';
import { SessionEndedError } from '../session/session-ended.error';
import { apiErrorOutcome } from './api-error';
import type { ErrorCode } from './api-error';

/** Una respuesta de error con el envelope del backend. */
const apiError = (
  status: number,
  code: string,
  details?: { field: string; message: string }[],
): HttpErrorResponse =>
  new HttpErrorResponse({
    status,
    error: { error: { code, message: 'Mensaje del backend', ...(details ? { details } : {}) } },
  });

describe('apiErrorOutcome', () => {
  describe('cada código de ERROR_CODES', () => {
    const cases: [ErrorCode, number, ReturnType<typeof apiErrorOutcome>][] = [
      [
        'VALIDATION_ERROR',
        400,
        { kind: 'message', code: 'VALIDATION_ERROR', message: 'Revisa los datos del formulario.' },
      ],
      [
        'UNAUTHENTICATED',
        401,
        {
          kind: 'message',
          code: 'UNAUTHENTICATED',
          message: 'Tu sesión no está activa. Vuelve a iniciar sesión.',
        },
      ],
      [
        'INVALID_CREDENTIALS',
        401,
        {
          kind: 'message',
          code: 'INVALID_CREDENTIALS',
          message: 'Correo o contraseña incorrectos.',
        },
      ],
      ['TOKEN_EXPIRED', 401, { kind: 'none' }],
      ['INVALID_TOKEN', 401, { kind: 'none' }],
      [
        'ACCOUNT_DISABLED',
        403,
        {
          kind: 'message',
          code: 'ACCOUNT_DISABLED',
          message: 'Tu cuenta está desactivada. Comunícate con la coordinación de investigación.',
        },
      ],
      [
        'FORBIDDEN',
        403,
        {
          kind: 'message',
          code: 'FORBIDDEN',
          message: 'No tienes permiso para realizar esta acción.',
        },
      ],
      [
        'NOT_FOUND',
        404,
        { kind: 'message', code: 'NOT_FOUND', message: 'No existe o no tienes acceso.' },
      ],
      [
        'CONFLICT',
        409,
        {
          kind: 'message',
          code: 'CONFLICT',
          message: 'La acción no es posible en el estado actual.',
        },
      ],
      [
        'INTERNAL_ERROR',
        500,
        {
          kind: 'message',
          code: 'INTERNAL_ERROR',
          message: 'Algo falló en el servidor. Inténtalo de nuevo en unos minutos.',
        },
      ],
    ];

    it.each(cases)('%s', (code, status, expected) => {
      expect(apiErrorOutcome(apiError(status, code))).toEqual(expected);
    });

    it('nunca usa el mensaje del backend como aviso', () => {
      const outcome = apiErrorOutcome(apiError(409, 'CONFLICT'));

      expect(outcome).not.toMatchObject({ message: 'Mensaje del backend' });
    });
  });

  describe('errores de campo', () => {
    it('VALIDATION_ERROR con details da el mapa de campos y el respaldo general', () => {
      const error = apiError(400, 'VALIDATION_ERROR', [
        { field: 'title', message: 'El título debe tener al menos 3 caracteres' },
        { field: 'endDate', message: 'La fecha de fin no puede ser anterior a la de inicio' },
      ]);

      expect(apiErrorOutcome(error)).toEqual({
        kind: 'fields',
        fields: {
          title: 'El título debe tener al menos 3 caracteres',
          endDate: 'La fecha de fin no puede ser anterior a la de inicio',
        },
        message: 'Revisa los datos del formulario.',
      });
    });

    it('si un campo trae varios mensajes, se queda con el primero', () => {
      const error = apiError(400, 'VALIDATION_ERROR', [
        { field: 'title', message: 'Primero' },
        { field: 'title', message: 'Segundo' },
      ]);

      expect(apiErrorOutcome(error)).toMatchObject({
        kind: 'fields',
        fields: { title: 'Primero' },
      });
    });

    it('un error de todo el objeto, sin campos, es un aviso con su propio mensaje', () => {
      const error = apiError(400, 'VALIDATION_ERROR', [
        { field: '(raíz)', message: 'Hay que enviar al menos un campo para actualizar' },
      ]);

      expect(apiErrorOutcome(error)).toEqual({
        kind: 'message',
        code: 'VALIDATION_ERROR',
        message: 'Hay que enviar al menos un campo para actualizar',
      });
    });

    it('un error de todo el objeto junto a campos pasa a ser el respaldo', () => {
      const error = apiError(400, 'VALIDATION_ERROR', [
        { field: '(raíz)', message: 'Error del objeto' },
        { field: 'title', message: 'Error del título' },
      ]);

      expect(apiErrorOutcome(error)).toEqual({
        kind: 'fields',
        fields: { title: 'Error del título' },
        message: 'Error del objeto',
      });
    });
  });

  describe('sin código de la API', () => {
    it('fallo de red: status 0', () => {
      const error = new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') });

      expect(apiErrorOutcome(error)).toEqual({
        kind: 'message',
        code: null,
        message: 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.',
      });
    });

    it('un código que el cliente no conoce cae en el texto genérico', () => {
      expect(apiErrorOutcome(apiError(418, 'TEAPOT'))).toEqual({
        kind: 'message',
        code: null,
        message: 'Algo salió mal. Inténtalo de nuevo.',
      });
    });

    it('una respuesta sin envelope, como el HTML de un proxy, cae en el texto genérico', () => {
      const error = new HttpErrorResponse({ status: 502, error: '<html>Bad Gateway</html>' });

      expect(apiErrorOutcome(error)).toEqual({
        kind: 'message',
        code: null,
        message: 'Algo salió mal. Inténtalo de nuevo.',
      });
    });

    it.each([
      ['un TypeError', new TypeError('x is not a function')],
      ['null', null],
      ['undefined', undefined],
      ['una cadena', 'falló'],
    ])('%s cae en el texto genérico sin lanzar', (_name, error) => {
      expect(apiErrorOutcome(error)).toEqual({
        kind: 'message',
        code: null,
        message: 'Algo salió mal. Inténtalo de nuevo.',
      });
    });
  });

  describe('resuelto por el interceptor', () => {
    it('SessionEndedError no muestra nada', () => {
      expect(apiErrorOutcome(new SessionEndedError())).toEqual({ kind: 'none' });
    });

    it('un texto sustituto no hace visible un código resuelto', () => {
      const error = apiError(401, 'INVALID_TOKEN');

      expect(apiErrorOutcome(error, { INVALID_TOKEN: 'Otro texto' })).toEqual({ kind: 'none' });
    });
  });

  describe('texto sustituto de la acción', () => {
    it('cambia el texto del código indicado', () => {
      const error = apiError(409, 'CONFLICT');

      expect(apiErrorOutcome(error, { CONFLICT: 'El proyecto ya está cerrado.' })).toEqual({
        kind: 'message',
        code: 'CONFLICT',
        message: 'El proyecto ya está cerrado.',
      });
    });

    it('no toca los demás códigos', () => {
      const error = apiError(403, 'FORBIDDEN');

      expect(apiErrorOutcome(error, { CONFLICT: 'El proyecto ya está cerrado.' })).toEqual({
        kind: 'message',
        code: 'FORBIDDEN',
        message: 'No tienes permiso para realizar esta acción.',
      });
    });

    it('cambia el respaldo de los errores de campo', () => {
      const error = apiError(400, 'VALIDATION_ERROR', [{ field: 'email', message: 'Inválido' }]);

      expect(
        apiErrorOutcome(error, { VALIDATION_ERROR: 'Revisa el correo de la persona.' }),
      ).toMatchObject({ kind: 'fields', message: 'Revisa el correo de la persona.' });
    });
  });
});
