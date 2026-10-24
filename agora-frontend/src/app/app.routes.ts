import { Routes } from '@angular/router';

// Rutas en español, como las de la API: es lo que ve la persona en la barra de
// direcciones. Cada pantalla se carga diferida, solo cuando se visita.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  {
    path: 'entrar',
    title: 'Iniciar sesión · Ágora',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'registro',
    title: 'Crear cuenta · Ágora',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'sesion-expirada',
    title: 'Sesión terminada · Ágora',
    loadComponent: () =>
      import('./features/auth/session-expired/session-expired').then((m) => m.SessionExpired),
  },
  // Protegidas a partir de la parte 5, cuando lleguen los guards.
  {
    path: 'inicio',
    title: 'Inicio · Ágora',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'reportes',
    title: 'Reportes · Ágora',
    loadComponent: () => import('./features/reports/reports').then((m) => m.Reports),
  },
  // Hasta que exista la pantalla de "no encontrado".
  { path: '**', redirectTo: 'inicio' },
];
