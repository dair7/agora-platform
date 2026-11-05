import 'dotenv/config';
import { z } from 'zod';

// Formato aceptado para las vigencias: un número seguido de s, m, h o d.
const DURATION = /^\d+[smhd]$/;

// Una línea `SUPABASE_URL=` deja una cadena vacía, no una variable ausente.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const isOrigin = (value: string): boolean => URL.canParse(value) && new URL(value).pathname === '/';

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1, 'es obligatoria'),
    JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
    JWT_EXPIRES_IN: z.string().regex(DURATION, 'debe tener el formato 15m, 1h, 7d…').default('15m'),
    REFRESH_TOKEN_EXPIRES_IN: z
      .string()
      .regex(DURATION, 'debe tener el formato 15m, 1h, 7d…')
      .default('7d'),
    // Reducido al origen: el navegador compara este valor letra por letra con la cabecera
    // Origin, y una barra final bastaría para rechazar todas las peticiones. Lo usan
    // Express y Socket.io.
    CORS_ORIGIN: z
      .string()
      .refine(isOrigin, 'debe ser un solo origen, con su esquema y sin ruta')
      .transform((url) => new URL(url).origin)
      .default('http://localhost:4200'),
    // Opcionales a propósito: si fueran obligatorias, quien clone el repositorio no
    // podría ni levantar el backend sin crearse una cuenta en Supabase. Sin ellas,
    // los archivos van al disco local y todo funciona.
    // Solo el origen: el panel de Supabase ofrece la URL con `/rest/v1/`, y con esa
    // ruta la librería responde «Invalid path specified in request URL».
    SUPABASE_URL: optional(z.url('debe ser una URL').transform((url) => new URL(url).origin)),
    SUPABASE_SECRET_KEY: optional(z.string()),
    SUPABASE_BUCKET: optional(z.string()),
  })
  // Las tres o ninguna. Con una a medias, los archivos acabarían en el disco sin
  // que nadie lo haya decidido, y en producción ese disco no sobrevive a un reinicio.
  .refine(
    ({ SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_BUCKET }) =>
      [SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_BUCKET].filter(Boolean).length % 3 === 0,
    {
      message: 'hay que definir SUPABASE_URL, SUPABASE_SECRET_KEY y SUPABASE_BUCKET, o ninguna',
      path: ['SUPABASE_URL'],
    },
  )
  // El valor por defecto es el de desarrollo: en producción dejaría fuera al cliente.
  .refine(({ NODE_ENV }) => NODE_ENV !== 'production' || Boolean(process.env.CORS_ORIGIN), {
    message: 'es obligatoria en producción: es el dominio del cliente',
    path: ['CORS_ORIGIN'],
  })
  // Sin esto el servidor arrancaría, y los archivos se perderían en el siguiente reinicio.
  .refine(({ NODE_ENV, SUPABASE_URL }) => NODE_ENV !== 'production' || Boolean(SUPABASE_URL), {
    message:
      'en producción hay que definir SUPABASE_URL, SUPABASE_SECRET_KEY y SUPABASE_BUCKET: el disco local no sobrevive a un reinicio',
    path: ['SUPABASE_URL'],
  });

const parsed = envSchema.safeParse(process.env);

// El proceso muere aquí y no a mitad de una petición: si falta JWT_SECRET, el
// servidor no debe llegar a aceptar ni un login.
if (!parsed.success) {
  console.error('Configuración de entorno inválida:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
