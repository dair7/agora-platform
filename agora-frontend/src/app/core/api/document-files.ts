// Lo que el cliente sabe de antemano sobre un archivo, sin preguntarle al servidor.

/** Copia de `MAX_FILE_MEGABYTES` de `middlewares/upload.ts`. */
export const MAX_UPLOAD_MEGABYTES = 20;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MEGABYTES * 1024 * 1024;
const MAX_NAME_LENGTH = 255;

/**
 * Por qué no se puede subir este archivo, o `null` si se puede. Son las mismas reglas de
 * `uploadFile` en el backend: comprobarlas aquí evita gastar la subida de alguien para
 * recibir un `400` al final.
 */
export const uploadProblem = (file: Pick<File, 'name' | 'size'>): string | null => {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `El archivo no puede superar ${MAX_UPLOAD_MEGABYTES} MB.`;
  }

  if (file.size === 0) {
    return 'El archivo está vacío.';
  }

  return file.name.length > MAX_NAME_LENGTH
    ? `El nombre del archivo no puede superar ${MAX_NAME_LENGTH} caracteres.`
    : null;
};

/**
 * El nombre de `Content-Disposition`. Primero `filename*`, que es el que conserva las
 * tildes: el `filename` simple las cambia por guiones bajos.
 */
export const fileNameFromDisposition = (header: string | null): string | null => {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header ?? '')?.[1];

  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Mal codificado: queda el nombre simple.
    }
  }

  return /filename="([^"]*)"/i.exec(header ?? '')?.[1] || null;
};
