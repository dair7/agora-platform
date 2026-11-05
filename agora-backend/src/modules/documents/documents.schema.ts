import { z } from 'zod';

// Mismo motivo que en proyectos: el uuid se valida antes del middleware de
// acceso, o un identificador malformado llegaría hasta Prisma.
export const documentParamsSchema = z.object({
  projectId: z.uuid('El identificador del proyecto no es válido'),
  documentId: z.uuid('El identificador del documento no es válido'),
});

// Llega como campo de texto del formulario `multipart`, junto al archivo. El
// archivo no pasa por aquí: lo valida `uploadFile`.
export const uploadDocumentSchema = z.strictObject(
  { taskId: z.uuid('El identificador de la tarea no es válido').optional() },
  'El formulario solo admite el archivo y taskId',
);

// Una versión nueva hereda la tarea de la anterior, así que no lleva campos.
export const uploadVersionSchema = z.strictObject(
  {},
  'Una versión nueva solo lleva el archivo: la tarea es la de la versión anterior',
);

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type DocumentParams = z.infer<typeof documentParamsSchema>;
