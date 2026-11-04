import type { ProjectDetail } from '../../core/api/projects.types';

/**
 * Si quien mira gestiona este proyecto: es su investigador principal y el proyecto
 * sigue abierto. La coordinación lo ve pero no lo gestiona (el backend le responde
 * 403), y un coinvestigador tampoco.
 *
 * Se decide con lo que ya trae el detalle, sin otra petición. Vive aquí porque la
 * usan el detalle, para pintar las acciones, y la pantalla de editar, para dejar
 * entrar: si se separaran, habría un botón que lleva a un rebote.
 */
export const canManageProject = (
  project: Pick<ProjectDetail, 'status' | 'members'>,
  userId: string | undefined,
): boolean =>
  project.status !== 'COMPLETED' &&
  project.members.some((m) => m.role === 'PRINCIPAL_INVESTIGATOR' && m.user.id === userId);
