/** Lo que tarda en soltarse la URL: el navegador tiene que empezar a leerla antes. */
const REVOKE_DELAY_MS = 10_000;

/**
 * Entrega al navegador un archivo ya descargado, con su nombre. Hace falta un enlace con
 * `download` porque el archivo llegó por una petición con token: no hay URL que abrir.
 */
export const saveFile = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
};
