import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/session/auth.guards';

// Rutas en español, como las de la API: es lo que ve la persona en la barra de
// direcciones. Cada pantalla se carga diferida, solo cuando se visita.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
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
      // Sin guard, como editar: qué puede hacer cada quien lo decide la pantalla.
      {
        path: 'proyectos/:projectId/cronograma',
        title: 'Cronograma · Ágora',
        loadComponent: () =>
          import('./features/projects/project-schedule/project-schedule').then(
            (m) => m.ProjectSchedule,
          ),
      },
      {
        path: 'proyectos/:projectId/tareas',
        title: 'Tareas · Ágora',
        loadComponent: () =>
          import('./features/projects/project-tasks/project-tasks').then((m) => m.ProjectTasks),
      },
      {
        path: 'proyectos/:projectId/avances',
        title: 'Avances · Ágora',
        loadComponent: () =>
          import('./features/projects/project-progress/project-progress').then(
            (m) => m.ProjectProgress,
          ),
      },
      {
        path: 'proyectos/:projectId/documentos',
        title: 'Documentos · Ágora',
        loadComponent: () =>
          import('./features/projects/project-documents/project-documents').then(
            (m) => m.ProjectDocuments,
          ),
      },
      // Sin guard, como editar: que la persona participe lo decide el backend.
      {
        path: 'proyectos/:projectId/conversacion',
        title: 'Conversación · Ágora',
        loadComponent: () =>
          import('./features/projects/project-chat/project-chat').then((m) => m.ProjectChat),
      },
      {
        path: 'conversaciones',
        title: 'Mensajes · Ágora',
        loadComponent: () =>
          import('./features/conversations/conversation-list/conversation-list').then(
            (m) => m.ConversationList,
          ),
      },
      // Sin guard: quién participa lo decide el backend, con la fila de participante.
      {
        path: 'conversaciones/:conversationId',
        // Provisional: la pantalla lo cambia por el nombre de la otra persona.
        title: 'Conversación · Ágora',
        loadComponent: () =>
          import('./features/conversations/conversation-detail/conversation-detail').then(
            (m) => m.ConversationDetail,
          ),
      },
      // Donde se aterriza: distinto para cada rol.
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
      // Solo la coordinación: a los demás la ruta no les coincide y cae en el comodín, y el
      // backend lo rechaza igual con un 403 en cada llamada.
      {
        path: 'cuentas',
        title: 'Cuentas · Ágora',
        canMatch: [roleGuard('COORDINATOR')],
        loadComponent: () => import('./features/accounts/accounts').then((m) => m.Accounts),
      },
    ],
  },
  // Hasta que exista la pantalla de "no encontrado".
  { path: '**', redirectTo: 'inicio' },
];
