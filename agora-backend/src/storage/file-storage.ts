/**
 * El puerto del almacén de archivos. La base guarda solo la metadata; los bytes
 * viven detrás de esta interfaz, y quien la usa no sabe en cuál de las dos
 * implementaciones. `key` es la ruta interna, la que queda en `storage_path`.
 */
export interface FileStorage {
  /** Nombre para el log de arranque: dice dónde quedan los archivos. */
  readonly label: string;
  /** Sobrescribe si la clave ya existe: el seed se corre muchas veces. */
  save(key: string, content: Buffer, contentType: string): Promise<void>;
  /** Lanza `StoredFileNotFoundError` si no existe. */
  read(key: string): Promise<Buffer>;
  /** Idempotente: borrar lo que no existe no es un error. */
  remove(key: string): Promise<void>;
}

/** La fila sigue en la base pero el archivo no está en el almacén. */
export class StoredFileNotFoundError extends Error {
  constructor(key: string) {
    super(`El almacén no tiene el archivo ${key}`);
    this.name = 'StoredFileNotFoundError';
  }
}
