import { createClient, StorageApiError } from '@supabase/supabase-js';
import type { FileStorage } from './file-storage.js';
import { StoredFileNotFoundError } from './file-storage.js';

interface SupabaseConfig {
  url: string;
  secretKey: string;
  bucket: string;
}

/**
 * La clave es una secreta nueva (`sb_secret_...`), no la antigua `service_role`;
 * para la librería es lo mismo. Va solo en el backend: la descarga pasa por aquí
 * y el navegador nunca habla con Supabase.
 */
export const createSupabaseStorage = ({ url, secretKey, bucket }: SupabaseConfig): FileStorage => {
  const client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const files = client.storage.from(bucket);

  return {
    label: `Supabase Storage (bucket ${bucket})`,

    async save(key, content, contentType) {
      const { error } = await files.upload(key, content, { contentType, upsert: true });

      if (error) {
        throw error;
      }
    },

    async read(key) {
      const { data, error } = await files.download(key);

      if (error) {
        // El servicio responde 400 o 404 según la versión; los dos dicen lo mismo.
        if (error instanceof StorageApiError && [400, 404].includes(error.status)) {
          throw new StoredFileNotFoundError(key);
        }

        throw error;
      }

      return Buffer.from(await data.arrayBuffer());
    },

    async remove(key) {
      const { error } = await files.remove([key]);

      if (error) {
        throw error;
      }
    },
  };
};
