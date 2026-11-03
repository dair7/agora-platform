/**
 * «{investigador principal} · {N} miembros», la línea que comparten la tarjeta de
 * la lista y la cabecera del detalle: pasar de una a otra no debe sentirse un salto.
 *
 * Sin investigador principal dice «Sin investigador principal» y no `null`: la API
 * lo garantiza, pero el esquema no.
 */
export const formatProjectLead = (
  principalInvestigatorName: string | null,
  memberCount: number,
): string => {
  const members = `${memberCount} ${memberCount === 1 ? 'miembro' : 'miembros'}`;

  return `${principalInvestigatorName ?? 'Sin investigador principal'} · ${members}`;
};
