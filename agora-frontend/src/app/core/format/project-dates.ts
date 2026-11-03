// Los meses se escriben aquí y no con `Intl`: `es-CO` da «4 de sept de 2026», y
// cada motor de ICU abrevia distinto. Con la tabla, el texto es el mismo en
// cualquier navegador.
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

interface DateParts {
  day: number;
  month: string;
  year: number;
}

/**
 * Siempre con los getters UTC. Las fechas del proyecto son columnas `date` que
 * llegan a medianoche UTC (`2026-03-01T00:00:00.000Z`); leídas en la hora local
 * de Colombia, UTC−5, caen a las 19:00 del día anterior y se mostrarían un día antes.
 */
const parts = (iso: string): DateParts => {
  const date = new Date(iso);

  return { day: date.getUTCDate(), month: MONTHS[date.getUTCMonth()], year: date.getUTCFullYear() };
};

const full = ({ day, month, year }: DateParts): string => `${day} ${month} ${year}`;

/**
 * El periodo de un proyecto como texto: «1 mar – 30 nov 2026» si las dos fechas
 * caen en el mismo año, «1 ago 2026 – 31 jul 2027» si no, «Desde …» o «Hasta …»
 * si solo hay una, y una cadena vacía si no hay ninguna: quien la use no pinta nada.
 */
export const formatProjectPeriod = (startDate: string | null, endDate: string | null): string => {
  if (startDate && endDate) {
    const start = parts(startDate);
    const end = parts(endDate);

    return start.year === end.year
      ? `${start.day} ${start.month} – ${full(end)}`
      : `${full(start)} – ${full(end)}`;
  }

  if (startDate) {
    return `Desde ${full(parts(startDate))}`;
  }

  if (endDate) {
    return `Hasta ${full(parts(endDate))}`;
  }

  return '';
};

/**
 * La fecha de cierre, **en la hora local de quien mira, no en UTC**.
 *
 * El UTC de arriba no vale para todo. `startDate` y `endDate` son columnas `date`:
 * un día del calendario sin hora, que llega a medianoche UTC y por eso se lee en
 * UTC. `closedAt` es un `timestamptz`: un instante real. Un proyecto cerrado a las
 * 21:00 del 29 de enero en Cartagena se guarda como el 30 a las 02:00 UTC, y leído
 * en UTC diría «30 ene», un día después de cuando se cerró.
 */
export const formatClosedAt = (closedAt: string): string => {
  const date = new Date(closedAt);

  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};
