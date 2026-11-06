/**
 * Sin los caracteres que se confunden al leerlos o dictarlos: `0` con `O`, `1` con `l` e
 * `I`. La contraseña no la escribe nadie, la entrega la coordinación por otro medio y la
 * persona la copia, así que tiene que poder leerse sin dudas.
 */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';

export const PASSWORD_ALPHABET = UPPER + LOWER + DIGITS;

/** 14 caracteres de 57 posibles: unos 82 bits, y cabe de sobra en los 72 que acepta bcrypt. */
export const PASSWORD_LENGTH = 14;

/**
 * Primer valor que no se usa: 256 no se reparte en partes iguales entre 57 caracteres, y
 * aceptar el sobrante favorecería a los primeros del alfabeto. Se descarta y se pide otro.
 */
const UNBIASED_LIMIT = 256 - (256 % PASSWORD_ALPHABET.length);

const has = (password: string, set: string): boolean => [...password].some((c) => set.includes(c));

/**
 * Una contraseña aleatoria de `crypto.getRandomValues`, nunca de `Math.random`: este es
 * generador de uso general y no sirve para un secreto. Lleva siempre mayúscula, minúscula
 * y dígito, porque aunque el backend no lo exija, una cuenta nueva no debería salir con
 * una contraseña floja por azar; se vuelve a sacar hasta que las tenga, lo que no sesga
 * el resultado dentro de lo permitido.
 *
 * Vive solo en memoria de quien la pide. Esta función no la guarda ni la registra.
 */
export const generatePassword = (length: number = PASSWORD_LENGTH): string => {
  for (;;) {
    let password = '';

    while (password.length < length) {
      const bytes = crypto.getRandomValues(new Uint8Array(length));

      for (const byte of bytes) {
        if (byte < UNBIASED_LIMIT && password.length < length) {
          password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
        }
      }
    }

    if (has(password, UPPER) && has(password, LOWER) && has(password, DIGITS)) {
      return password;
    }
  }
};
