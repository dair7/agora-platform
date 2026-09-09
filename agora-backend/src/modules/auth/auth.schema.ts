import { z } from 'zod';

// `.trim()` y `.toLowerCase()` son transformaciones y corren después de la
// validación, así que normalizar antes de comprobar el formato exige el `pipe`.
// Sin esto, un correo con un espacio al final se rechazaría por inválido.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email('El correo no tiene un formato válido')
      .max(255, 'El correo no puede superar 255 caracteres'),
  );

// bcrypt trunca a 72 bytes en silencio. El máximo es explícito para que una
// contraseña más larga se rechace en vez de recortarse sin que nadie se entere.
const password = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña no puede superar 72 caracteres');

// Zod descarta las claves que el esquema no declara, así que `system_role` no
// puede colarse por el cuerpo de la petición.
export const registerSchema = z.object({
  email,
  password,
  fullName: z
    .string()
    .trim()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(150, 'El nombre no puede superar 150 caracteres'),
});

// Al iniciar sesión la contraseña solo tiene que venir: validar aquí su formato
// no aporta seguridad y dejaría fuera a cuentas creadas con reglas anteriores.
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'El token de refresco es obligatorio'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
