import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { env, isProduction } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import v1Routes from './routes/v1.js';

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

// Ruta de infraestructura: queda fuera de /api/v1 a propósito.
app.get('/salud', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Cliente HTML de la demo de conectividad. Servido desde aquí comparte origen
// con la API y con Socket.io, así que no depende del CORS. Fuera de producción:
// no es parte de la aplicación. La ruta se resuelve desde este archivo, que
// queda a la misma profundidad en `src/` y en `dist/`.
if (!isProduction) {
  app.use('/demo', express.static(fileURLToPath(new URL('../../docs/demo', import.meta.url))));
}

app.use('/api/v1', v1Routes);

// Van al final, después de todas las rutas.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
