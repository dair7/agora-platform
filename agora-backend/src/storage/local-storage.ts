import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FileStorage } from './file-storage.js';
import { StoredFileNotFoundError } from './file-storage.js';

// Se resuelve desde este archivo, que queda a la misma profundidad en `src/` y en
// `dist/`. La carpeta está en `.gitignore`.
const ROOT = fileURLToPath(new URL('../../uploads', import.meta.url));

/**
 * Las claves las genera el servidor, nunca el cliente, pero salir de la carpeta
 * sería demasiado grave para dejarlo a esa suposición.
 */
const pathOf = (key: string): string => {
  const path = resolve(ROOT, key);

  if (!path.startsWith(ROOT + sep)) {
    throw new Error(`Clave de archivo fuera del almacén: ${key}`);
  }

  return path;
};

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

export const createLocalStorage = (): FileStorage => ({
  label: `disco local (${ROOT})`,

  async save(key, content) {
    const path = pathOf(key);

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  },

  async read(key) {
    try {
      return await readFile(pathOf(key));
    } catch (error) {
      if (isMissingFile(error)) {
        throw new StoredFileNotFoundError(key);
      }

      throw error;
    }
  },

  async remove(key) {
    await rm(pathOf(key), { force: true });
  },
});
