import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { SessionService } from './session.service';
import type { PublicUser, SystemRole } from './session.types';

const userWith = (systemRole: SystemRole): PublicUser => ({
  id: '00000000-0000-0000-0000-000000000001',
  email: 'persona@example.com',
  fullName: 'Persona de prueba',
  systemRole,
  createdAt: '2026-10-24T00:00:00.000Z',
});

/**
 * Las rutas son las de la aplicación, no una copia: si a una ruta se le olvida
 * su guard en `app.routes.ts`, falla aquí. La sesión es un doble con lo único que
 * leen los guards.
 */
describe('guards de sesión y rol', () => {
  const user = signal<PublicUser | null>(null);
  let router: Router;

  const visit = async (url: string) => {
    await router.navigateByUrl(url);
    return router.url;
  };

  beforeEach(() => {
    user.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        {
          provide: SessionService,
          useValue: { user, isAuthenticated: computed(() => user() !== null) },
        },
      ],
    });
    router = TestBed.inject(Router);
  });

  describe('sin sesión', () => {
    it('lleva a iniciar sesión desde inicio', async () => {
      expect(await visit('/inicio')).toBe('/entrar');
    });

    it('lleva a iniciar sesión desde reportes', async () => {
      expect(await visit('/reportes')).toBe('/entrar');
    });

    it('lleva a iniciar sesión desde una dirección que no existe', async () => {
      expect(await visit('/no-existe')).toBe('/entrar');
    });

    it('deja entrar, registrarse y ver la sesión expirada', async () => {
      expect(await visit('/entrar')).toBe('/entrar');
      expect(await visit('/registro')).toBe('/registro');
      expect(await visit('/sesion-expirada')).toBe('/sesion-expirada');
    });
  });

  describe('investigación', () => {
    beforeEach(() => user.set(userWith('RESEARCHER')));

    it('entra a inicio', async () => {
      expect(await visit('/inicio')).toBe('/inicio');
    });

    it('no entra a reportes: la ruta no le existe y acaba en inicio', async () => {
      expect(await visit('/reportes')).toBe('/inicio');
    });

    it('no vuelve a iniciar sesión ni a registrarse', async () => {
      expect(await visit('/entrar')).toBe('/inicio');
      expect(await visit('/registro')).toBe('/inicio');
    });
  });

  describe('coordinación', () => {
    beforeEach(() => user.set(userWith('COORDINATOR')));

    it('entra a inicio y a reportes', async () => {
      expect(await visit('/inicio')).toBe('/inicio');
      expect(await visit('/reportes')).toBe('/reportes');
    });
  });

  // Los guards leen la sesión en cada navegación, no la recuerdan. Se navega a
  // otra ruta: repetir la misma dirección no dispara navegación ni guards.
  it('pierde las rutas protegidas en cuanto termina la sesión', async () => {
    user.set(userWith('COORDINATOR'));
    expect(await visit('/reportes')).toBe('/reportes');

    user.set(null);
    expect(await visit('/inicio')).toBe('/entrar');
  });
});
