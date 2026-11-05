// Producción. El cliente (Vercel) y la API (Render) viven en dominios distintos, así que
// la URL es absoluta. La pone el build, desde `API_URL`: ver `scripts/build-deploy.mjs`.
// `ng build` a secas la deja vacía (`define` en angular.json), y eso no se publica.
declare const AGORA_API_URL: string;

export const environment = {
  apiUrl: AGORA_API_URL,
};
