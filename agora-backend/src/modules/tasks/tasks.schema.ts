import { z } from 'zod';
import { TaskPriority, TaskStatus } from '@prisma/client';

// Todos los mensajes están escritos aquí, también los de tipo, como en fases: sin
// ellos saldría el inglés por defecto de Zod.
//
// `strictObject` y no `object`: un campo no declarado responde 400 en vez de
// desaparecer en silencio. Importa sobre todo en `PATCH`, donde quien tiene la
// tarea asignada solo puede tocar el estado: si `validate` quitara lo que sobra,
// un cuerpo con otros campos pasaría como si solo trajera el estado.
const invalidBody = 'El cuerpo debe ser un objeto JSON y traer solo campos de la tarea';

const taskId = z.uuid('El identificador de la tarea no es válido');
const projectId = z.uuid('El identificador del proyecto no es válido');

// Mismo motivo que en proyectos: el uuid se valida antes del middleware de
// acceso, o un identificador malformado llegaría hasta Prisma.
export const taskParamsSchema = z.object({ projectId, taskId });

export const dependencyParamsSchema = z.object({
  projectId,
  taskId,
  dependsOnId: z.uuid('El identificador de la dependencia no es válido'),
});

const phaseId = z.uuid('El identificador de la fase no es válido');

const title = z
  .string('El título de la tarea es obligatorio')
  .trim()
  .min(3, 'El título debe tener al menos 3 caracteres')
  .max(200, 'El título no puede superar 200 caracteres');

const optionalText = z
  .string('La descripción debe ser un texto')
  .trim()
  .max(5000, 'La descripción no puede superar 5000 caracteres')
  .optional();

const status = z.enum(TaskStatus, 'El estado de la tarea no es válido');
const priority = z.enum(TaskPriority, 'La prioridad de la tarea no es válida');
const assigneeId = z.uuid('El identificador del responsable no es válido');

// La columna es @db.Date, así que solo interesa la fecha, como en proyectos.
const date = z.iso
  .date('La fecha debe tener el formato YYYY-MM-DD')
  .transform((value) => new Date(value));

// `completedAt` no está en ninguno de los dos: lo estampa el servidor al pasar a
// `DONE`. Aceptarlo daría dos fuentes de verdad para lo mismo.
export const createTaskSchema = z
  .strictObject(
    {
      phaseId,
      title,
      description: optionalText,
      status: status.optional(),
      priority: priority.optional(),
      assigneeId: assigneeId.optional(),
      startDate: date.optional(),
      dueDate: date.optional(),
    },
    invalidBody,
  )
  .refine((input) => !input.startDate || !input.dueDate || input.startDate <= input.dueDate, {
    message: 'La fecha límite no puede ser anterior a la de inicio',
    path: ['dueDate'],
  });

// Actualización parcial: la coherencia entre fechas la resuelve el servicio.
// `phaseId` es mover la tarea de fase, la salida del 409 al borrar una fase.
// `null` vacía el campo y ausente no lo cambia, en lo que la creación no exige:
// `title` y `phaseId` no lo admiten.
export const updateTaskSchema = z
  .strictObject(
    {
      phaseId: phaseId.optional(),
      title: title.optional(),
      description: optionalText.nullable(),
      status: status.optional(),
      priority: priority.optional(),
      assigneeId: assigneeId.nullable().optional(),
      startDate: date.nullable().optional(),
      dueDate: date.nullable().optional(),
    },
    invalidBody,
  )
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Hay que enviar al menos un campo para actualizar',
  });

export const addDependencySchema = z.strictObject(
  { dependsOnTaskId: z.uuid('El identificador de la dependencia no es válido') },
  'El cuerpo debe ser un objeto JSON con dependsOnTaskId',
);

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type AddDependencyInput = z.infer<typeof addDependencySchema>;
export type TaskParams = z.infer<typeof taskParamsSchema>;
export type DependencyParams = z.infer<typeof dependencyParamsSchema>;
