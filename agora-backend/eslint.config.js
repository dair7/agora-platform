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
    // Los archivos de configuracion no forman parte del proyecto de TypeScript.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Debe ir al final: apaga las reglas de formato que chocan con Prettier.
  prettier,
]);
