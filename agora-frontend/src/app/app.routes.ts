import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/session/auth.guards';

// Rutas en español, como las de la API: es lo que ve la persona en la barra de
// direcciones. Cada pantalla se carga diferida, solo cuando se visita.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'proyectos' },
  {
    path: 'entrar',
    title: 'Iniciar sesión · Ágora',
    canMatch: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'sesion-expirada',
    title: 'Sesión terminada · Ágora',
    // Con sesión no hay nada que haya expirado.
    canMatch: [guestGuard],
    loadComponent: () =>
      import('./features/auth/session-expired/session-expired').then((m) => m.SessionExpired),
  },
  // Todo lo de aquí dentro exige sesión y se pinta dentro del armazón. Una ruta
  // nueva de la aplicación se agrega como hija, no al lado: así no puede quedarse
  // sin protección.
  {
    path: '',
    canMatch: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: 'proyectos',
        title: 'Proyectos · Ágora',
        loadComponent: () =>
          import('./features/projects/project-list/project-list').then((m) => m.ProjectList),
      },
      // Antes que `proyectos/:projectId`, o «nuevo» se leería como un identificador. A
      // quien no es de la coordinación la ruta no le coincide y sigue hasta esa otra:
      // el backend rechaza el identificador y acaba en la pantalla de no encontrado.
      {
        path: 'proyectos/nuevo',
        title: 'Crear proyecto · Ágora',
        canMatch: [roleGuard('COORDINATOR')],
        loadComponent: () =>
          import('./features/projects/project-create/project-create').then((m) => m.ProjectCreate),
      },
      {
        path: 'proyectos/:projectId',
        // Provisional: la pantalla lo cambia por el nombre del proyecto cuando llega.
        title: 'Proyecto · Ágora',
        loadComponent: () =>
          import('./features/projects/project-detail/project-detail').then((m) => m.ProjectDetail),
      },
      // Sin guard: ser investigador principal depende del proyecto, y un guard no lo
      // sabe sin pedirlo. Lo comprueba la pantalla, que de todos modos lo carga.
      {
        path: 'proyectos/:projectId/editar',
        title: 'Editar proyecto · Ágora',
        loadComponent: () =>
          import('./features/projects/project-edit/project-edit').then((m) => m.ProjectEdit),
      },
      // Pantalla provisional de la fase 3. La reemplaza el inicio por rol de la
      // fase 13; hasta entonces se queda, aunque la raíz ya no lleve aquí.
      {
        path: 'inicio',
        title: 'Inicio · Ágora',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
      },
      {
        path: 'reportes',
        title: 'Reportes · Ágora',
        canMatch: [roleGuard('COORDINATOR')],
        loadComponent: () => import('./features/reports/reports').then((m) => m.Reports),
      },
    ],
  },
  // Hasta que exista la pantalla de "no encontrado".
  { path: '**', redirectTo: 'proyectos' },
];
