// Producción. El cliente (Vercel) y la API (Render) viven en dominios distintos,
// así que la URL es absoluta. Se completa con el despliegue, en la fase 14:
// mientras esté vacía, un build de producción no tiene a qué API hablar.
export const environment = {
  apiUrl: '',
};
