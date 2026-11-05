import type { Request, RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from './error-handler.js';

const MAX_FILE_MEGABYTES = 20;
const MAX_NAME_LENGTH = 255;

// Una cabecera `Content-Type` mal formada haría fallar la descarga.
const MIME_TYPE = /^[\w.+-]+\/[\w.+-]+$/;
const MAX_MIME_LENGTH = 150;
const UNKNOWN_MIME_TYPE = 'application/octet-stream';

// En memoria: con el tope de 20 MB no hace falta pasar por un archivo temporal, y
// así el mismo `Buffer` sirve para las dos implementaciones del almacén.
//
// `defParamCharset` es obligatorio: por defecto el nombre del archivo se lee como
// latin1, y «protocolo de acción.pdf» se guardaría con el acento roto.
const parseFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MEGABYTES * 1024 * 1024, files: 1 },
  defParamCharset: 'utf8',
}).single('file');

const invalidFile = (message: string): AppError =>
  new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
    { field: 'file', message },
  ]);

const parseError = (error: unknown): AppError =>
  error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
    ? invalidFile(`El archivo no puede superar ${MAX_FILE_MEGABYTES} MB`)
    : invalidFile('No se pudo leer el archivo enviado');

/**
 * Valida el tamaño aquí y no solo en el bucket: el mensaje sale en castellano y
 * desde nuestro contrato de errores, no del almacén. Va después de las puertas de
 * acceso, para que nadie sin permiso llegue a mandar 20 MB al servidor.
 */
export const uploadFile: RequestHandler = (req, res, next) => {
  parseFile(req, res, (error: unknown) => {
    if (error) {
      next(parseError(error));
      return;
    }

    if (!req.file) {
      next(invalidFile('Hay que enviar el archivo en el campo file'));
      return;
    }

    if (req.file.size === 0) {
      next(invalidFile('El archivo está vacío'));
      return;
    }

    if (req.file.originalname.length > MAX_NAME_LENGTH) {
      next(invalidFile(`El nombre del archivo no puede superar ${MAX_NAME_LENGTH} caracteres`));
      return;
    }

    next();
  });
};

export interface UploadedFile {
  name: string;
  mimeType: string;
  sizeBytes: number;
  content: Buffer;
}

/** Gemelo de `getAuthUser`: `req.file` solo existe en las rutas con `uploadFile`. */
export const getUploadedFile = (req: Request): UploadedFile => {
  if (!req.file) {
    throw new AppError(500, 'INTERNAL_ERROR', 'La ruta no procesó el archivo');
  }

  const { originalname, mimetype, size, buffer } = req.file;

  return {
    name: originalname,
    mimeType:
      mimetype.length <= MAX_MIME_LENGTH && MIME_TYPE.test(mimetype) ? mimetype : UNKNOWN_MIME_TYPE,
    sizeBytes: size,
    content: buffer,
  };
};
