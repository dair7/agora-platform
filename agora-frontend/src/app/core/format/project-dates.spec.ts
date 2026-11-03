import { formatProjectPeriod } from './project-dates';

describe('formatProjectPeriod', () => {
  describe('en UTC, también en la hora de Colombia', () => {
    // Las pruebas corren en la zona de quien las lance, y en UTC el error no se
    // vería. Con la zona de Colombia, leer la fecha en hora local la corre un día.
    beforeEach(() => vi.stubEnv('TZ', 'America/Bogota'));
    afterEach(() => vi.unstubAllEnvs());

    it('la zona de prueba de verdad corre las fechas, o la prueba no prueba nada', () => {
      expect(new Date('2026-03-01T00:00:00.000Z').getDate()).toBe(28);
    });

    it('una fecha a medianoche UTC se muestra en su día, no en el anterior', () => {
      expect(formatProjectPeriod('2026-03-01T00:00:00.000Z', '2026-11-30T00:00:00.000Z')).toBe(
        '1 mar – 30 nov 2026',
      );
    });

    it('el 1 de enero no cae en el año anterior', () => {
      expect(formatProjectPeriod('2027-01-01T00:00:00.000Z', null)).toBe('Desde 1 ene 2027');
    });
  });

  it('mismo año: el año va una sola vez, al final', () => {
    expect(formatProjectPeriod('2026-03-01T00:00:00.000Z', '2026-11-30T00:00:00.000Z')).toBe(
      '1 mar – 30 nov 2026',
    );
  });

  it('años distintos: cada fecha lleva su año', () => {
    expect(formatProjectPeriod('2026-08-01T00:00:00.000Z', '2027-07-31T00:00:00.000Z')).toBe(
      '1 ago 2026 – 31 jul 2027',
    );
  });

  it('solo inicio', () => {
    expect(formatProjectPeriod('2026-03-01T00:00:00.000Z', null)).toBe('Desde 1 mar 2026');
  });

  it('solo fin', () => {
    expect(formatProjectPeriod(null, '2026-11-30T00:00:00.000Z')).toBe('Hasta 30 nov 2026');
  });

  it('sin fechas: cadena vacía', () => {
    expect(formatProjectPeriod(null, null)).toBe('');
  });
});
