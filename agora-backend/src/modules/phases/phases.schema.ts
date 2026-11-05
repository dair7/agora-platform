import { z } from 'zod';
import { PhaseStatus } from '@prisma/client';

// Todos los mensajes están escritos aquí, también los de tipo: sin ellos saldría
// el inglés por defecto de Zod. El segundo argumento de `z.object`, de `z.enum`
// o el primero de `z.string` es el que cubre un campo ausente, un tipo
// equivocado o un cuerpo que no llega.
const invalidBody = 'El cuerpo de la petición debe ser un objeto JSON';

// Mismo motivo que en proyectos: el uuid se valida antes del middleware de
// acceso, o un identificador malformado llegaría hasta Prisma.
export const phaseParamsSchema = z.object({
  projectId: z.uuid('El identificador del proyecto no es válido'),
  phaseId: z.uuid('El identificador de la fase no es válido'),
});

const name = z
  .string('El nombre de la fase es obligatorio')
  .trim()
  .min(3, 'El nombre debe tener al menos 3 caracteres')
  .max(150, 'El nombre no puede superar 150 caracteres');

const optionalText = z
  .string('La descripción debe ser un texto')
  .trim()
  .max(5000, 'La descripción no puede superar 5000 caracteres')
  .optional();

const status = z.enum(PhaseStatus, 'El estado de la fase no es válido');

// La columna es @db.Date, así que solo interesa la fecha, como en proyectos.
const date = z.iso
  .date('La fecha debe tener el formato YYYY-MM-DD')
  .transform((value) => new Date(value));

// `position` tiene un solo camino de escritura: la pone el servidor al crear y
// solo la cambia PUT /orden. Se rechaza en vez de dejar que `validate` la quite
// en silencio: un 200 haría creer a quien la manda que la fase se movió.
const position = z
  .never('La posición no se envía aquí: la asigna el servidor y solo cambia con PUT /orden')
  .optional();

export const createPhaseSchema = z
  .object(
    {
      name,
      description: optionalText,
      status: status.optional(),
      startDate: date.optional(),
      endDate: date.optional(),
      position,
    },
    invalidBody,
  )
  .refine((input) => !input.startDate || !input.endDate || input.startDate <= input.endDate, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['endDate'],
  });

// Actualización parcial: la coherencia entre fechas la resuelve el servicio,
// porque el cuerpo puede traer solo una y la otra está en la base. `null` vacía el
// campo y ausente no lo cambia; `name` no lo admite, porque es obligatorio al crear.
export const updatePhaseSchema = z
  .strictObject(
    {
      name: name.optional(),
      description: optionalText.nullable(),
      status: status.optional(),
      startDate: date.nullable().optional(),
      endDate: date.nullable().optional(),
      position,
    },
    'El cuerpo debe ser un objeto JSON y traer solo campos de la fase',
  )
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Hay que enviar al menos un campo para actualizar',
  });

// El orden se manda entero, nunca fase por fase: mover posiciones de una en una
// deja huecos y empates si dos personas reordenan a la vez, y una lista completa
// no puede quedar a medias. Que sean exactamente las fases del proyecto lo
// comprueba el repositorio, que es quien las tiene.
//
// `expectedPhaseIds` es el orden que el cliente vio antes de mover. Sin él, dos personas
// moviendo a la vez: gana la última y la otra nunca se entera de que su cambio se perdió.
export const reorderPhasesSchema = z.object(
  {
    phaseIds: z.array(
      z.uuid('Cada identificador de fase debe ser válido'),
      'Hay que enviar la lista completa de fases',
    ),
    expectedPhaseIds: z
      .array(
        z.uuid('Cada identificador de fase debe ser válido'),
        'El orden visto debe ser una lista de fases',
      )
      .optional(),
  },
  invalidBody,
);

export type CreatePhaseInput = z.infer<typeof createPhaseSchema>;
export type UpdatePhaseInput = z.infer<typeof updatePhaseSchema>;
export type ReorderPhasesInput = z.infer<typeof reorderPhasesSchema>;
export type PhaseParams = z.infer<typeof phaseParamsSchema>;
