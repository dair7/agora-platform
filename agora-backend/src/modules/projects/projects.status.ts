import { ProjectStatus } from '@prisma/client';

/**
 * Un proyecto en estos estados ya no está abierto: nadie va a trabajar en él. Una pausa no
 * entra: es temporal. Es la única definición: la usan la baja de cuentas y los reportes.
 */
export const CLOSED_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.COMPLETED,
  ProjectStatus.CANCELLED,
];
