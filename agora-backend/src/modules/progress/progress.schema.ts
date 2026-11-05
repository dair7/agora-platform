import { z } from 'zod';

// Todos los mensajes están escritos aquí, también los de tipo: sin ellos saldría
// el inglés por defecto de Zod. `strictObject`, como en tareas: un campo no
// declarado responde 400 en vez de desaparecer en silencio.
const invalidBody = 'El cuerpo debe ser un objeto JSON y traer solo campos del avance';

// Mismo motivo que en proyectos: el uuid se valida antes del middleware de
// acceso, o un identificador malformado llegaría hasta Prisma.
export const progressParamsSchema = z.object({
  projectId: z.uuid('El identificador del proyecto no es válido'),
  progressId: z.uuid('El identificador del avance no es válido'),
});

const description = z
  .string('La descripción del avance es obligatoria')
  .trim()
  .min(1, 'La descripción no puede estar vacía')
  .max(5000, 'La descripción no puede superar 5000 caracteres');

const taskId = z.uuid('El identificador de la tarea no es válido');

export const createProgressSchema = z.strictObject(
  { description, taskId: taskId.optional() },
  invalidBody,
);

// `taskId` admite `null`: un avance sin tarea es un estado legítimo, y quien lo
// escribió tiene que poder soltarlo de una tarea puesta por error.
export const updateProgressSchema = z
  .strictObject(
    { description: description.optional(), taskId: taskId.nullable().optional() },
    invalidBody,
  )
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Hay que enviar al menos un campo para actualizar',
  });

export type CreateProgressInput = z.infer<typeof createProgressSchema>;
export type UpdateProgressInput = z.infer<typeof updateProgressSchema>;
export type ProgressParams = z.infer<typeof progressParamsSchema>;
