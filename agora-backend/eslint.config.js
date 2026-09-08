import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**', 'src/generated/**']),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Vive fuera de src/, asi que el tsconfig no lo incluye.
          allowDefaultProject: ['prisma.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      // Express reconoce el manejador de errores por su aridad: la firma debe
      // tener cuatro parametros aunque no se usen todos.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Ampliar `Express.Request` con `req.user` solo se puede via `declare
      // global` y un namespace. No hay equivalente con sintaxis de modulos.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },
  {
    // Los archivos de configuracion no forman parte del proyecto de TypeScript.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Debe ir al final: apaga las reglas de formato que chocan con Prettier.
  prettier,
]);
