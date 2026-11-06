import { PASSWORD_ALPHABET, PASSWORD_LENGTH, generatePassword } from './generate-password';

describe('generatePassword', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tiene 14 caracteres', () => {
    expect(PASSWORD_LENGTH).toBe(14);
    expect(generatePassword()).toHaveLength(14);
  });

  it('solo usa el alfabeto, y en ninguna corrida aparece un carácter ambiguo', () => {
    for (let i = 0; i < 2000; i++) {
      const password = generatePassword();

      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{14}$/);
      expect(password).not.toMatch(/[0O1lI]/);
    }
  });

  it('el alfabeto no trae ninguno de los ambiguos y no repite caracteres', () => {
    for (const ambiguous of '0O1lI') {
      expect(PASSWORD_ALPHABET).not.toContain(ambiguous);
    }

    expect(new Set(PASSWORD_ALPHABET).size).toBe(PASSWORD_ALPHABET.length);
  });

  it('siempre lleva mayúscula, minúscula y dígito', () => {
    for (let i = 0; i < 2000; i++) {
      const password = generatePassword();

      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[2-9]/);
    }
  });

  it('usa crypto.getRandomValues y nunca Math.random', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random no es para secretos');
    });
    const crypt = vi.spyOn(crypto, 'getRandomValues');

    generatePassword();

    expect(crypt).toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });

  it('descarta los bytes que sesgarían el reparto en vez de aplicarles el módulo', () => {
    // 57 × 4 = 228: del 228 al 255 el módulo favorecería a los primeros caracteres. El primer
    // bloque trae un 255 al principio y 13 bytes buenos (0, 4… 48); el segundo, un 52. Si el 255
    // se aprovechara saldría un carácter más al principio (255 % 57 = 27) y el resultado
    // cambiaría; descartado, hacen falta los dos bloques y la contraseña es la esperada.
    const first = Uint8Array.from([255, ...Array.from({ length: 13 }, (_, i) => i * 4)]);
    // Con un dígito, una minúscula y una mayúscula: si el 255 se aprovechara, el reintento
    // tendría con qué terminar y la prueba fallaría con un resultado, no con un bucle.
    const second = Uint8Array.from({ length: 14 }, (_, i) => [52, 0, 24][i % 3]);

    // Dos bloques y después el `crypto` de verdad: una implementación equivocada no se queda
    // pidiendo siempre lo mismo.
    const crypt = vi
      .spyOn(crypto, 'getRandomValues')
      .mockImplementationOnce((array) => {
        (array as Uint8Array).set(first);
        return array;
      })
      .mockImplementationOnce((array) => {
        (array as Uint8Array).set(second);
        return array;
      });

    const password = generatePassword();

    expect(crypt.mock.calls.length).toBe(2);
    expect(password).toBe([...first.slice(1), 52].map((b) => PASSWORD_ALPHABET[b]).join(''));
  });

  it('dos llamadas no devuelven la misma contraseña', () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
