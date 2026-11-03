import { HttpParams } from '@angular/common/http';

/**
 * Los parámetros de consulta de una lista, con los nombres en español del
 * contrato. Los `undefined` no se envían, y el texto se recorta y se omite si
 * queda vacío: `buscar=` vacío es un 400 en la lista de proyectos, y al cargar
 * una lista por primera vez el campo de búsqueda está vacío.
 */
export const toQueryParams = (query: Record<string, string | number | undefined>): HttpParams => {
  let params = new HttpParams();

  for (const [name, raw] of Object.entries(query)) {
    const value = typeof raw === 'string' ? raw.trim() : raw;

    if (value !== undefined && value !== '') {
      params = params.set(name, value);
    }
  }

  return params;
};
