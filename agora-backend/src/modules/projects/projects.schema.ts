import { z } from 'zod';
import { ProjectStatus } from '@prisma/client';

// Los parámetros de ruta se validan aparte y siempre antes del middleware de
// acceso: un uuid malformado contra una columna @db.Uuid hace que Prisma lance
// P2023, y eso debe ser un 400, no un fallo del servidor.
export const projectIdParamsSchema = z.object({
  projectId: z.uuid('El identificador del proyecto no es válido'),
});

export const memberParamsSchema = z.object({
  projectId: z.uuid('El identificador del proyecto no es válido'),
  userId: z.uuid('El identificador del usuario no es válido'),
});

// Los parámetros de consulta van en español: son contrato público, igual que
// las rutas. El `transform` los traduce al inglés del código interno, así que
// la frontera queda en este archivo y no se filtra al servicio.
export const listProjectsQuerySchema = z
  .object({
    estado: z.enum(ProjectStatus).optional(),
    buscar: z
      .string()
      .trim()
      .min(1, 'El texto de búsqueda no puede estar vacío')
      .max(200, 'El texto de búsqueda no puede superar 200 caracteres')
      .optional(),
    pagina: z.coerce.number().int().positive('La página debe ser un entero positivo').default(1),
    porPagina: z.coerce
      .number()
      .int()
      .positive('El tamaño de página debe ser un entero positivo')
      .max(100, 'El tamaño de página no puede superar 100')
      .default(20),
  })
  .transform((query) => ({
    status: query.estado,
    search: query.buscar,
    page: query.pagina,
    perPage: query.porPagina,
  }));

const title = z
  .string()
  .trim()
  .min(3, 'El título debe tener al menos 3 caracteres')
  .max(200, 'El título no puede superar 200 caracteres');

const optionalText = z
  .string()
  .trim()
  .max(5000, 'El texto no puede superar 5000 caracteres')
  .optional();

// La columna es @db.Date, así que solo interesa la fecha. `z.iso.date()` exige
// el formato YYYY-MM-DD y descarta cadenas con hora, que se guardarían mal.
const date = z.iso.date().transform((value) => new Date(value));

const budget = z
  .number()
  .nonnegative('El presupuesto no puede ser negativo')
  .max(999_999_999_999.99, 'El presupuesto excede el máximo permitido');

export const createProjectSchema = z
  .object({
    title,
    description: optionalText,
    objectives: optionalText,
    startDate: date.optional(),
    endDate: date.optional(),
    budget: budget.optional(),
    // El coordinador crea el proyecto, pero el investigador principal es otra
    // persona: sin esta referencia el proyecto nacería sin nadie que lo gestione.
    principalInvestigatorId: z.uuid('El identificador del investigador principal no es válido'),
  })
  .refine(
    (input) => !input.startDate || !input.endDate || input.startDate <= input.endDate,
    // El `path` hace que el detalle del error apunte a un campo concreto y no a
    // la raíz del objeto.
    { message: 'La fecha de fin no puede ser anterior a la de inicio', path: ['endDate'] },
  );

// `COMPLETED` no está: cerrar un proyecto estampa `closed_at` y tiene su propio
// endpoint. Dejarlo aquí permitiría cerrar un proyecto sin esa marca.
const updatableStatus = z.enum([
  ProjectStatus.PLANNING,
  ProjectStatus.IN_PROGRESS,
  ProjectStatus.ON_HOLD,
  ProjectStatus.CANCELLED,
]);

// Actualización parcial: todo opcional. La coherencia entre fechas no se puede
// resolver aquí, porque el cuerpo puede traer solo una de las dos y la otra
// está en la base; de eso se encarga el servicio, que sí tiene el proyecto.
export const updateProjectSchema = z
  .object({
    title: title.optional(),
    description: optionalText,
    objectives: optionalText,
    status: updatableStatus.optional(),
    startDate: date.optional(),
    endDate: date.optional(),
    budget: budget.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Hay que enviar al menos un campo para actualizar',
  });

// Se invita por correo y no por identificador: no existe todavía un módulo de
// usuarios donde buscarlos, y es como una persona invita a otra en la práctica.
export const addMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      z
        .email('El correo no tiene un formato válido')
        .max(255, 'El correo no puede superar 255 caracteres'),
    ),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type MemberParams = z.infer<typeof memberParamsSchema>;
