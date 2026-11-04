import { formatLocalDay } from './project-dates';

// `createdAt` es un instante, como `closedAt`: todo aquí va en la hora local de
// quien mira. En UTC, un mensaje de las 21:00 en Cartagena caería en el día siguiente.

const dayKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** Identifica el día local de un instante, para saber dónde va un separador. */
export const messageDayKey = (createdAt: string): string => dayKey(new Date(createdAt));

/** «Hoy», «Ayer» o la fecha. */
export const formatMessageDay = (createdAt: string, now = new Date()): string => {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const day = messageDayKey(createdAt);

  if (day === dayKey(now)) {
    return 'Hoy';
  }

  return day === dayKey(yesterday) ? 'Ayer' : formatLocalDay(createdAt);
};

/** «16:42». */
export const formatMessageTime = (createdAt: string): string => {
  const date = new Date(createdAt);
  const pad = (value: number): string => String(value).padStart(2, '0');

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
