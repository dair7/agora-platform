import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

// Ruta de infraestructura: queda fuera de /api/v1 a propósito.
app.get('/salud', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Van al final, después de todas las rutas.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
