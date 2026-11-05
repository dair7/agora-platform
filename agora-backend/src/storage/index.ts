import { env } from '../config/env.js';
import type { FileStorage } from './file-storage.js';
import { createLocalStorage } from './local-storage.js';
import { createSupabaseStorage } from './supabase-storage.js';

export { StoredFileNotFoundError } from './file-storage.js';

/**
 * Se decide una vez, al arrancar. `env.ts` ya garantizó que las tres variables
 * vienen juntas o no viene ninguna; `server.ts` registra cuál se usa.
 */
const createFileStorage = (): FileStorage =>
  env.SUPABASE_URL && env.SUPABASE_SECRET_KEY && env.SUPABASE_BUCKET
    ? createSupabaseStorage({
        url: env.SUPABASE_URL,
        secretKey: env.SUPABASE_SECRET_KEY,
        bucket: env.SUPABASE_BUCKET,
      })
    : createLocalStorage();

export const fileStorage = createFileStorage();
