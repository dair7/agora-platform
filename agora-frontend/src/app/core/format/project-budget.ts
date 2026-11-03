/**
 * La moneda está fija en el código: todos los proyectos son de la misma
 * universidad y presupuestan en pesos colombianos. Si alguna vez hubiera otra,
 * sale a configuración; no se agrega un parámetro aquí.
 */
const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/**
 * El presupuesto como pesos colombianos, o `null` si no hay. Llega como cadena
 * (`"45000000"`): es un `Decimal` de Prisma y el JSON lo serializa así.
 */
export const formatBudget = (budget: string | null): string | null => {
  if (budget === null || budget.trim() === '') {
    return null;
  }

  const amount = Number(budget);

  return Number.isFinite(amount) ? COP.format(amount) : null;
};
