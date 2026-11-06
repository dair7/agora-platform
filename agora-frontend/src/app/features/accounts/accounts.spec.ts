import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AccountsApi } from '../../core/api/accounts.api';
import { UsersApi } from '../../core/api/users.api';
import type { UserSummary } from '../../core/api/users.types';
import { SessionService } from '../../core/session/session.service';
import type { PublicUser } from '../../core/session/session.types';
import { Accounts } from './accounts';

const SELF: UserSummary = {
  id: 'u-self',
  email: 'coordinacion@example.com',
  fullName: 'Coordinación de Investigación',
  systemRole: 'COORDINATOR',
  isActive: true,
};
const LAURA: UserSummary = {
  id: 'u-laura',
  email: 'laura.mendoza@example.com',
  fullName: 'Laura Mendoza',
  systemRole: 'RESEARCHER',
  isActive: true,
};
const OLD: UserSummary = {
  id: 'u-old',
  email: 'persona.antigua@example.com',
  fullName: 'Persona Antigua',
  systemRole: 'RESEARCHER',
  isActive: false,
};

const PASSWORD_SHAPE = /^[A-HJ-NP-Za-km-z2-9]{14}$/;

const conflict = () =>
  new HttpErrorResponse({
    status: 409,
    error: { error: { code: 'CONFLICT', message: 'texto del servidor que no se muestra' } },
  });

describe('Accounts', () => {
  const users = {
    list: vi.fn<UsersApi['list']>(),
    rename: vi.fn<UsersApi['rename']>(),
    deactivate: vi.fn<UsersApi['deactivate']>(),
    reactivate: vi.fn<UsersApi['reactivate']>(),
    resetPassword: vi.fn<UsersApi['resetPassword']>(),
  };
  const accounts = { create: vi.fn<AccountsApi['create']>() };

  let fixture: ComponentFixture<Accounts>;
  let page: HTMLElement;

  // jsdom no implementa <dialog>.showModal(): se reproduce lo único que el componente usa.
  beforeAll(() => {
    const proto = HTMLDialogElement.prototype;

    if (typeof proto.showModal !== 'function') {
      proto.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
      proto.close = function (this: HTMLDialogElement) {
        if (this.hasAttribute('open')) {
          this.removeAttribute('open');
          this.dispatchEvent(new Event('close'));
        }
      };
    }
  });

  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.clear();
    users.list.mockReset().mockResolvedValue([SELF, LAURA, OLD]);
    users.rename.mockReset().mockResolvedValue(LAURA);
    users.deactivate.mockReset().mockResolvedValue(undefined);
    users.reactivate.mockReset().mockResolvedValue(OLD);
    users.resetPassword.mockReset().mockResolvedValue(undefined);
    accounts.create.mockReset().mockResolvedValue({
      id: 'u-new',
      email: 'nueva@example.com',
      fullName: 'Persona Nueva',
      systemRole: 'RESEARCHER',
      createdAt: '2026-11-06T00:00:00.000Z',
    });

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: UsersApi, useValue: users },
        { provide: AccountsApi, useValue: accounts },
        {
          provide: SessionService,
          useValue: { user: signal<PublicUser | null>({ ...SELF, createdAt: '' }) },
        },
      ],
    });

    fixture = TestBed.createComponent(Accounts);
    page = fixture.nativeElement as HTMLElement;
    await settle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  const rows = () => [...page.querySelectorAll<HTMLElement>('main ul > li')];
  const rowOf = (name: string) => rows().find((row) => row.textContent?.includes(name))!;
  const buttonsIn = (root: ParentNode) => [...root.querySelectorAll<HTMLButtonElement>('button')];
  const buttonNamed = (root: ParentNode, label: string) =>
    buttonsIn(root).find((button) => button.textContent?.trim().startsWith(label))!;
  const dialogTitled = (start: string) =>
    [...page.querySelectorAll<HTMLDialogElement>('dialog')].find((dialog) =>
      dialog.querySelector('h2')?.textContent?.trim().startsWith(start),
    )!;

  /** Abre un diálogo: el título y los valores se pintan cuando la vista se actualiza. */
  const open = (button: HTMLElement) => {
    button.click();
    fixture.detectChanges();
  };

  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const generatedIn = (dialog: HTMLDialogElement): string | null =>
    dialog.querySelector('app-generated-password p.select-all')?.textContent?.trim() ?? null;

  describe('la lista', () => {
    it('muestra nombre, correo y rol en palabras de cada cuenta', () => {
      expect(rows()).toHaveLength(3);
      expect(rowOf('Laura Mendoza').textContent).toContain('laura.mendoza@example.com');
      expect(rowOf('Laura Mendoza').textContent).toContain('Investigación');
      expect(rowOf('Coordinación de Investigación').textContent).toContain('Coordinación');
      expect(page.textContent).not.toContain('RESEARCHER');
    });

    it('la propia cuenta dice «Tú» y no tiene ninguna acción', () => {
      const own = rowOf('Coordinación de Investigación');

      expect(own.textContent).toContain('Tú');
      expect(buttonsIn(own)).toHaveLength(0);
      expect(rowOf('Laura Mendoza').textContent).not.toContain('Tú');
    });

    it('marca la desactivada y le ofrece reactivar, no desactivar', () => {
      const old = rowOf('Persona Antigua');

      expect(old.textContent).toContain('Desactivada');
      expect(buttonNamed(old, 'Reactivar')).toBeTruthy();
      expect(buttonNamed(old, 'Desactivar')).toBeUndefined();
      expect(buttonNamed(rowOf('Laura Mendoza'), 'Desactivar')).toBeTruthy();
      expect(rowOf('Laura Mendoza').textContent).not.toContain('Desactivada');
    });

    it('pide solo las activas hasta que se enciende «Mostrar desactivadas»', async () => {
      expect(users.list).toHaveBeenLastCalledWith({
        rol: undefined,
        buscar: '',
        incluirInactivas: false,
      });

      const toggle = page.querySelector<HTMLInputElement>('input[role="switch"]')!;

      expect(toggle.checked).toBe(false);

      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();

      expect(users.list).toHaveBeenLastCalledWith({
        rol: undefined,
        buscar: '',
        incluirInactivas: true,
      });
      expect(TestBed.inject(Router).url).toContain('desactivadas=true');
    });

    it('filtra por rol desde la URL', async () => {
      buttonNamed(page, 'Investigación').click();
      await settle();

      expect(users.list).toHaveBeenLastCalledWith(expect.objectContaining({ rol: 'RESEARCHER' }));
      expect(buttonNamed(page, 'Investigación').getAttribute('aria-pressed')).toBe('true');
    });

    it('un error de la lista se explica con texto y ofrece reintentar', async () => {
      users.list.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
      buttonNamed(page, 'Coordinación').click();
      await settle();

      expect(page.textContent).toContain('No hay conexión con el servidor');
      expect(buttonNamed(page, 'Reintentar')).toBeTruthy();
    });
  });

  describe('crear una cuenta', () => {
    const fillAndCreate = async (name: string, email: string) => {
      open(buttonNamed(page, 'Nueva cuenta'));
      const dialog = dialogTitled('Nueva cuenta');

      type(dialog.querySelector('#cuenta-nombre')!, name);
      type(dialog.querySelector('#cuenta-correo')!, email);
      buttonNamed(dialog, 'Crear cuenta').click();
      await settle();

      return dialog;
    };

    it('genera la contraseña en el cliente, la manda y la muestra una sola vez', async () => {
      const dialog = await fillAndCreate('  Persona Nueva  ', ' Nueva@Example.com ');

      expect(accounts.create).toHaveBeenCalledTimes(1);

      const sent = accounts.create.mock.calls[0][0];

      expect(sent.fullName).toBe('Persona Nueva');
      expect(sent.email).toBe('nueva@example.com');
      expect(sent.password).toMatch(PASSWORD_SHAPE);
      expect(dialog.querySelector('h2')?.textContent).toContain('Cuenta creada');
      expect(generatedIn(dialog)).toBe(sent.password);
      // La lista se vuelve a pedir: la cuenta nueva tiene que aparecer.
      expect(users.list.mock.calls.length).toBeGreaterThan(1);
    });

    it('al cerrar el diálogo la contraseña desaparece de la pantalla', async () => {
      const dialog = await fillAndCreate('Persona Nueva', 'nueva@example.com');
      const password = accounts.create.mock.calls[0][0].password;

      expect(page.textContent).toContain(password);

      // Por la vía que sea: aquí, el botón «Listo».
      buttonNamed(dialog, 'Listo').click();
      await settle();

      expect(page.textContent).not.toContain(password);
      expect(dialog.hasAttribute('open')).toBe(false);
    });

    it('cerrado con Escape también se borra: no depende del botón', async () => {
      const dialog = await fillAndCreate('Persona Nueva', 'nueva@example.com');
      const password = accounts.create.mock.calls[0][0].password;

      dialog.close();
      await settle();

      expect(page.textContent).not.toContain(password);
    });

    it('la contraseña no llega al almacenamiento, a la dirección ni a la consola', async () => {
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => undefined),
      );

      await fillAndCreate('Persona Nueva', 'nueva@example.com');

      const password = accounts.create.mock.calls[0][0].password;
      const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });

      expect(stored).not.toContain(password);
      expect(TestBed.inject(Router).url).not.toContain(password);
      expect(location.href).not.toContain(password);
      expect(JSON.stringify(spies.flatMap((spy) => spy.mock.calls))).not.toContain(password);
    });

    it('con datos inválidos no llama a la API y dice qué corregir bajo cada campo', async () => {
      const dialog = await fillAndCreate('ab', 'no-es-un-correo');

      expect(accounts.create).not.toHaveBeenCalled();
      expect(dialog.querySelector('#cuenta-nombre-error')?.textContent).toContain('entre 3 y 150');
      expect(dialog.querySelector('#cuenta-correo-error')?.textContent).toContain('correo válido');
      expect(dialog.querySelector('h2')?.textContent).toContain('Nueva cuenta');
    });

    it('un correo repetido (409) se dice bajo el correo, sin mostrar el código', async () => {
      accounts.create.mockRejectedValue(conflict());

      const dialog = await fillAndCreate('Persona Nueva', 'laura.mendoza@example.com');

      expect(dialog.querySelector('#cuenta-correo-error')?.textContent).toContain(
        'Ya hay una cuenta con ese correo.',
      );
      expect(dialog.textContent).not.toContain('CONFLICT');
      expect(dialog.textContent).not.toContain('texto del servidor');
      // Se queda abierto para corregir, y no queda ninguna contraseña a la vista.
      expect(generatedIn(dialog)).toBeNull();
    });
  });

  describe('restablecer la contraseña', () => {
    const openAndConfirm = async () => {
      open(buttonNamed(rowOf('Laura Mendoza'), 'Restablecer contraseña'));
      const dialog = dialogTitled('¿Restablecer la contraseña de Laura Mendoza?');

      buttonNamed(dialog, 'Restablecer contraseña').click();
      await settle();

      return dialog;
    };

    it('pide confirmación antes de tocar nada, y la cancelación no llama a la API', async () => {
      open(buttonNamed(rowOf('Laura Mendoza'), 'Restablecer contraseña'));
      const dialog = dialogTitled('¿Restablecer la contraseña de Laura Mendoza?');

      expect(dialog.hasAttribute('open')).toBe(true);
      expect(dialog.textContent).toContain('sesiones abiertas');
      buttonNamed(dialog, 'Cancelar').click();

      expect(users.resetPassword).not.toHaveBeenCalled();
    });

    it('manda la contraseña generada, la muestra una vez y la borra al cerrar', async () => {
      const dialog = await openAndConfirm();

      expect(users.resetPassword).toHaveBeenCalledTimes(1);

      const [id, password] = users.resetPassword.mock.calls[0];

      expect(id).toBe('u-laura');
      expect(password).toMatch(PASSWORD_SHAPE);
      expect(dialog.querySelector('h2')?.textContent).toContain('Contraseña restablecida');
      expect(generatedIn(dialog)).toBe(password);

      buttonNamed(dialog, 'Listo').click();
      await settle();

      expect(page.textContent).not.toContain(password);
    });

    it('cada restablecimiento genera una contraseña distinta', async () => {
      await openAndConfirm();
      buttonNamed(dialogTitled('Contraseña restablecida'), 'Listo').click();
      await settle();
      await openAndConfirm();

      const [first, second] = users.resetPassword.mock.calls.map((call) => call[1]);

      expect(first).not.toBe(second);
    });

    it('un fallo se explica en el diálogo, que sigue abierto y sin contraseña a la vista', async () => {
      users.resetPassword.mockRejectedValue(
        new HttpErrorResponse({
          status: 404,
          error: { error: { code: 'NOT_FOUND', message: 'x' } },
        }),
      );

      const dialog = await openAndConfirm();

      expect(dialog.hasAttribute('open')).toBe(true);
      expect(dialog.textContent).toContain('La cuenta ya no existe');
      expect(generatedIn(dialog)).toBeNull();
    });
  });

  describe('desactivar y reactivar', () => {
    const openDeactivate = () => {
      open(buttonNamed(rowOf('Laura Mendoza'), 'Desactivar'));

      return dialogTitled('¿Desactivar la cuenta de Laura Mendoza?');
    };

    it('explica que las sesiones se cierran antes de confirmar', () => {
      const dialog = openDeactivate();

      expect(dialog.textContent).toContain('sesiones se cierran');
      expect(users.deactivate).not.toHaveBeenCalled();
    });

    it('desactiva, cierra el diálogo y vuelve a pedir la lista', async () => {
      const dialog = openDeactivate();
      const calls = users.list.mock.calls.length;

      buttonNamed(dialog, 'Desactivar').click();
      await settle();

      expect(users.deactivate).toHaveBeenCalledWith('u-laura');
      expect(dialog.hasAttribute('open')).toBe(false);
      expect(users.list.mock.calls.length).toBeGreaterThan(calls);
    });

    it('si dirige proyectos abiertos (409), dice qué hacer y sigue abierto', async () => {
      users.deactivate.mockRejectedValue(conflict());

      const dialog = openDeactivate();

      buttonNamed(dialog, 'Desactivar').click();
      await settle();

      expect(dialog.hasAttribute('open')).toBe(true);
      expect(dialog.textContent).toContain('traspase la investigación principal');
      expect(dialog.textContent).not.toContain('CONFLICT');
      expect(dialog.textContent).not.toContain('texto del servidor');
    });

    it('reactiva sin pedir confirmación y recarga la lista', async () => {
      const calls = users.list.mock.calls.length;

      buttonNamed(rowOf('Persona Antigua'), 'Reactivar').click();
      await settle();

      expect(users.reactivate).toHaveBeenCalledWith('u-old');
      expect(users.list.mock.calls.length).toBeGreaterThan(calls);
    });

    it('si reactivar falla, el aviso está en la pantalla', async () => {
      users.reactivate.mockRejectedValue(conflict());

      buttonNamed(rowOf('Persona Antigua'), 'Reactivar').click();
      await settle();

      expect(page.textContent).toContain('La cuenta ya estaba activa');
    });
  });

  describe('editar el nombre', () => {
    const openEditor = () => {
      open(buttonNamed(rowOf('Laura Mendoza'), 'Editar nombre'));

      return dialogTitled('Editar nombre');
    };

    it('abre con el nombre actual y guarda solo el nombre', async () => {
      const dialog = openEditor();
      const input = dialog.querySelector<HTMLInputElement>('#cuenta-editar-nombre')!;

      expect(input.value).toBe('Laura Mendoza');

      type(input, '  Laura M. Mendoza ');
      buttonNamed(dialog, 'Guardar').click();
      await settle();

      expect(users.rename).toHaveBeenCalledWith('u-laura', 'Laura M. Mendoza');
      expect(dialog.hasAttribute('open')).toBe(false);
    });

    it('un nombre demasiado corto no sale del cliente', async () => {
      const dialog = openEditor();

      type(dialog.querySelector('#cuenta-editar-nombre')!, 'ab');
      buttonNamed(dialog, 'Guardar').click();
      await settle();

      expect(users.rename).not.toHaveBeenCalled();
      expect(dialog.querySelector('#cuenta-editar-nombre-error')?.textContent).toContain('entre 3');
    });

    it('sin cambios no hay nada que pedir', async () => {
      const dialog = openEditor();

      buttonNamed(dialog, 'Guardar').click();
      await settle();

      expect(users.rename).not.toHaveBeenCalled();
      expect(dialog.hasAttribute('open')).toBe(false);
    });
  });
});
