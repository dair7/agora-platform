import app from './app.js';
import { env } from './config/env.js';

// `env.ts` carga dotenv y valida el entorno al importarse.
app.listen(env.PORT, () => {
  console.log(`Servidor escuchando en el puerto http://localhost:${env.PORT}`);
});
