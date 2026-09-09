import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from './error-handler.js';

type RequestPart = 'body' | 'params' | 'query';

interface ValidationDetail {
  field: string;
  message: string;
}

/**
 * Corre un esquema de Zod sobre una parte de la petición y reemplaza el valor
 * original por el resultado parseado: tipos ya convertidos y sin las
 * propiedades que el esquema no declara.
 */
export const validate =
  (schema: ZodType, part: RequestPart = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      const details: ValidationDetail[] = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(raíz)',
        message: issue.message,
      }));

      throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', details);
    }

    // En Express 5 `req.query` es un getter sin setter y asignarlo lanza
    // TypeError; `defineProperty` lo sombrea en la instancia. `body` y `params`
    // aceptarían la asignación directa, pero el camino único es más claro.
    Object.defineProperty(req, part, {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });

    next();
  };
