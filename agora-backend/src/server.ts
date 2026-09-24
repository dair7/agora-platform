import { createServer } from 'node:http';
import app from './app.js';
import { env } from './config/env.js';
import { initSocketServer } from './sockets/index.js';

// `env.ts` carga dotenv y valida el entorno al importarse.
//
// El servidor HTTP se crea a mano y no con `app.listen()`, que crea el suyo sin
// exponerlo: Socket.io necesita montarse sobre el mismo.
const httpServer = createServer(app);

initSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`Servidor escuchando en el puerto http://localhost:${env.PORT}`);
});
