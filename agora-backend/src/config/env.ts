import 'dotenv/config';
import { z } from 'zod';

// Formato aceptado para las vigencias: un número seguido de s, m, h o d.
const DURATION = /^\d+[smhd]$/;

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'es obligatoria'),
  JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().regex(DURATION, 'debe tener el formato 15m, 1h, 7d…').default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z
    .string()
    .regex(DURATION, 'debe tener el formato 15m, 1h, 7d…')
    .default('7d'),
  CORS_ORIGIN: z.string().min(1, 'es obligatoria').default('http://localhost:4200'),
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
