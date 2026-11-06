// Build de producción para el despliegue. La URL de la API se fija aquí, al construir:
// el cliente es estático y en el navegador no hay entorno que leer.
//
// Falla si `API_URL` no sirve, y no construye un cliente sin API: con la URL vacía el
// build pasa, y la aplicación publicada le habla a su propio dominio.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXAMPLE = 'https://your-backend.example.com/api/v1';
const API_PATH = '/api/v1';

const fail = (problem) => {
  console.error(`API_URL ${problem}. Ejemplo: ${EXAMPLE}`);
  process.exit(1);
};

const parse = (value) => {
  if (!value) {
    fail('es obligatoria');
  }

  try {
    return new URL(value);
  } catch {
    fail('no es una URL');
  }
};

const url = parse(process.env.API_URL?.trim());

// Una página en https no puede llamar a http: el navegador lo bloquea.
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
  fail('tiene que ser https');
}

if (url.pathname.replace(/\/$/, '') !== API_PATH) {
  fail(`tiene que terminar en ${API_PATH}`);
}

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const ng = fileURLToPath(new URL('../node_modules/@angular/cli/bin/ng.js', import.meta.url));
const apiUrl = JSON.stringify(`${url.origin}${API_PATH}`);

const { status } = spawnSync(process.execPath, [ng, 'build', `--define=AGORA_API_URL=${apiUrl}`], {
  cwd: packageRoot,
  stdio: 'inherit',
});

process.exit(status ?? 1);
