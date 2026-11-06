/**
 * La zona de la universidad. `due_date` es una columna `date`, un día sin hora, así que
 * «hoy» tiene que ser el día de quien lo mira y no el del servidor: en UTC, una tarea que
 * vence hoy saldría vencida desde las 7 de la noche en Colombia.
 */
export const REPORTS_TIME_ZONE = 'America/Bogota';

/** `en-CA` es lo que escribe la fecha como `YYYY-MM-DD`, que es lo que entiende la base. */
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORTS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hoy como `YYYY-MM-DD`. Texto y no `Date`: un `Date` lo reinterpretaría en otra zona. */
export const todayInColombia = (now: Date = new Date()): string => dayFormat.format(now);
