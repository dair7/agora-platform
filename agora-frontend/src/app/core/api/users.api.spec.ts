import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { UsersApi } from './users.api';
import type { UserSummary } from './users.types';

const person: UserSummary = {
  id: 'a1000000-0000-4000-8000-000000000002',
  email: 'laura.mendoza@example.com',
  fullName: 'Laura Mendoza',
  systemRole: 'RESEARCHER',
  isActive: true,
};

/** La URL de una cuenta, tal como la arma el servicio. */
const urlOf = (id: string) => `${environment.apiUrl}/usuarios/${id}`;

describe('UsersApi', () => {
  let api: UsersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(UsersApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  describe('list', () => {
    it('sin filtros no manda ningún parámetro: el backend responde solo las activas', async () => {
      const result = api.list();
      const req = http.expectOne((r) => r.url.endsWith('/usuarios'));

      expect(req.request.params.keys()).toEqual([]);
      req.flush({ users: [person] });

      await expect(result).resolves.toEqual([person]);
    });

    it('manda incluirInactivas=true solo cuando se pide', async () => {
      const result = api.list({ incluirInactivas: true, rol: 'RESEARCHER', buscar: ' laura ' });
      const req = http.expectOne((r) => r.url.endsWith('/usuarios'));

      expect(req.request.params.get('incluirInactivas')).toBe('true');
      expect(req.request.params.get('rol')).toBe('RESEARCHER');
      // El texto se recorta, igual que en la lista de proyectos.
      expect(req.request.params.get('buscar')).toBe('laura');
      req.flush({ users: [] });
      await result;
    });

    it('incluirInactivas=false no se manda: el backend lo toma como ausente', async () => {
      const result = api.list({ incluirInactivas: false });
      const req = http.expectOne((r) => r.url.endsWith('/usuarios'));

      expect(req.request.params.has('incluirInactivas')).toBe(false);
      req.flush({ users: [] });
      await result;
    });
  });

  it('rename manda solo { fullName }: cualquier otra clave es un 400 en el backend', async () => {
    const result = api.rename(person.id, 'Laura M. Mendoza');
    const req = http.expectOne(urlOf(person.id));

    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ fullName: 'Laura M. Mendoza' });
    req.flush({ user: { ...person, fullName: 'Laura M. Mendoza' } });

    await expect(result).resolves.toMatchObject({ fullName: 'Laura M. Mendoza' });
  });

  it('deactivate es un DELETE sin cuerpo', async () => {
    const result = api.deactivate(person.id);
    const req = http.expectOne(urlOf(person.id));

    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    await expect(result).resolves.toBeUndefined();
  });

  it('reactivate llama a /reactivar y devuelve la cuenta', async () => {
    const result = api.reactivate(person.id);
    const req = http.expectOne(`${urlOf(person.id)}/reactivar`);

    expect(req.request.method).toBe('POST');
    req.flush({ user: person });

    await expect(result).resolves.toEqual(person);
  });

  describe('resetPassword', () => {
    it('manda { password } en el cuerpo, nunca en la dirección', async () => {
      const result = api.resetPassword(person.id, 'Xy7kQm2PzR9tBw');
      const req = http.expectOne(`${urlOf(person.id)}/restablecer-contrasena`);

      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ password: 'Xy7kQm2PzR9tBw' });
      expect(req.request.urlWithParams).not.toContain('Xy7kQm2PzR9tBw');
      req.flush(null, { status: 204, statusText: 'No Content' });

      await expect(result).resolves.toBeUndefined();
    });

    it('no devuelve nada: la contraseña no vuelve del servidor', async () => {
      const result = api.resetPassword(person.id, 'Xy7kQm2PzR9tBw');

      http
        .expectOne(`${urlOf(person.id)}/restablecer-contrasena`)
        .flush(null, { status: 204, statusText: 'No Content' });

      expect(await result).toBeUndefined();
    });
  });
});
