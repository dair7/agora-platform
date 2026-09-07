// Ágora — datos de prueba para desarrollo y sustentación.
//
// Idempotente: cada escritura es un `upsert` sobre un identificador fijo
// declarado en `ids`, de modo que correr el seed dos veces actualiza las filas
// existentes en lugar de duplicarlas. Los UUID de este archivo le pertenecen al
// seed; no reutilizarlos en datos creados a mano.
//
// ---------------------------------------------------------------------------
// Credenciales de prueba (todas las cuentas quedan activas)
// ---------------------------------------------------------------------------
// | Correo                             | Contraseña         | Rol            |
// | coordinacion@unicartagena.edu.co   | Coordinador123*    | Coordinador    |
// | laura.mendoza@unicartagena.edu.co  | Investigador123*   | IP en P1       |
// | carlos.beltran@unicartagena.edu.co | Investigador123*   | IP en P2 y P3  |
// | andres.pardo@unicartagena.edu.co   | Coinvestigador123* | Co en P1       |
// | sofia.navarro@unicartagena.edu.co  | Coinvestigador123* | Co en P1 y P3  |
// | daniel.osorio@unicartagena.edu.co  | Coinvestigador123* | Co en P2       |
//
// El rol de coordinador vive en `users.system_role`; los de investigador
// principal y coinvestigador viven en `project_members.role`.

import 'dotenv/config';
import {
  ConversationType,
  NotificationType,
  PhaseStatus,
  PrismaClient,
  ProjectRole,
  ProjectStatus,
  SystemRole,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 10;

const PASSWORDS = {
  coordinator: 'Coordinador123*',
  principal: 'Investigador123*',
  coInvestigator: 'Coinvestigador123*',
} as const;

/** Fecha calendario, para columnas `@db.Date`. */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Instante con zona, para columnas `@db.Timestamptz`. */
const at = (iso: string) => new Date(iso);

// ---------------------------------------------------------------------------
// Identificadores fijos: son la clave de la idempotencia.
// ---------------------------------------------------------------------------

const ids = {
  users: {
    coordinator: 'a1000000-0000-4000-8000-000000000001',
    laura: 'a1000000-0000-4000-8000-000000000002',
    carlos: 'a1000000-0000-4000-8000-000000000003',
    andres: 'a1000000-0000-4000-8000-000000000004',
    sofia: 'a1000000-0000-4000-8000-000000000005',
    daniel: 'a1000000-0000-4000-8000-000000000006',
  },
  projects: {
    cienaga: 'b1000000-0000-4000-8000-000000000001',
    movilidad: 'b1000000-0000-4000-8000-000000000002',
    desercion: 'b1000000-0000-4000-8000-000000000003',
  },
  phases: {
    cienagaPlaneacion: 'c1000000-0000-4000-8000-000000000001',
    cienagaCampo: 'c1000000-0000-4000-8000-000000000002',
    cienagaAnalisis: 'c1000000-0000-4000-8000-000000000003',
    movilidadFormulacion: 'c1000000-0000-4000-8000-000000000004',
    movilidadLevantamiento: 'c1000000-0000-4000-8000-000000000005',
    desercionCierre: 'c1000000-0000-4000-8000-000000000006',
  },
  tasks: {
    revisionLiteratura: 'd1000000-0000-4000-8000-000000000001',
    protocoloMuestreo: 'd1000000-0000-4000-8000-000000000002',
    muestreoSeca: 'd1000000-0000-4000-8000-000000000003',
    muestreoLluvias: 'd1000000-0000-4000-8000-000000000004',
    analisisLaboratorio: 'd1000000-0000-4000-8000-000000000005',
    procesamientoEstadistico: 'd1000000-0000-4000-8000-000000000006',
    redaccionArticulo: 'd1000000-0000-4000-8000-000000000007',
    propuestaConvocatoria: 'd1000000-0000-4000-8000-000000000008',
    avalEtica: 'd1000000-0000-4000-8000-000000000009',
    instrumentoEncuesta: 'd1000000-0000-4000-8000-00000000000a',
    informeFinal: 'd1000000-0000-4000-8000-00000000000b',
  },
  progress: {
    seca: 'e1000000-0000-4000-8000-000000000001',
    laboratorio: 'e1000000-0000-4000-8000-000000000002',
    comite: 'e1000000-0000-4000-8000-000000000003',
    borradorPropuesta: 'e1000000-0000-4000-8000-000000000004',
  },
  documents: {
    protocoloV1: 'f1000000-0000-4000-8000-000000000001',
    protocoloV2: 'f1000000-0000-4000-8000-000000000002',
    resultadosLaboratorio: 'f1000000-0000-4000-8000-000000000003',
    propuestaMovilidad: 'f1000000-0000-4000-8000-000000000004',
  },
  conversations: {
    cienaga: '0a000000-0000-4000-8000-000000000001',
    lauraAndres: '0a000000-0000-4000-8000-000000000002',
  },
  messages: {
    proyecto1: '0b000000-0000-4000-8000-000000000001',
    proyecto2: '0b000000-0000-4000-8000-000000000002',
    proyecto3: '0b000000-0000-4000-8000-000000000003',
    proyecto4: '0b000000-0000-4000-8000-000000000004',
    proyecto5: '0b000000-0000-4000-8000-000000000005',
    privado1: '0b000000-0000-4000-8000-000000000006',
    privado2: '0b000000-0000-4000-8000-000000000007',
  },
  notifications: {
    tareaAsignada: '0c000000-0000-4000-8000-000000000001',
    avanceCreado: '0c000000-0000-4000-8000-000000000002',
    documentoSubido: '0c000000-0000-4000-8000-000000000003',
  },
} as const;

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

async function seedUsers() {
  const [coordinatorHash, principalHash, coInvestigatorHash] = await Promise.all([
    hash(PASSWORDS.coordinator, BCRYPT_ROUNDS),
    hash(PASSWORDS.principal, BCRYPT_ROUNDS),
    hash(PASSWORDS.coInvestigator, BCRYPT_ROUNDS),
  ]);

  const users = [
    {
      id: ids.users.coordinator,
      email: 'coordinacion@unicartagena.edu.co',
      fullName: 'Marta Restrepo Villalba',
      systemRole: SystemRole.COORDINATOR,
      passwordHash: coordinatorHash,
    },
    {
      id: ids.users.laura,
      email: 'laura.mendoza@unicartagena.edu.co',
      fullName: 'Laura Mendoza Arrieta',
      systemRole: SystemRole.RESEARCHER,
      passwordHash: principalHash,
    },
    {
      id: ids.users.carlos,
      email: 'carlos.beltran@unicartagena.edu.co',
      fullName: 'Carlos Beltrán Padilla',
      systemRole: SystemRole.RESEARCHER,
      passwordHash: principalHash,
    },
    {
      id: ids.users.andres,
      email: 'andres.pardo@unicartagena.edu.co',
      fullName: 'Andrés Pardo Quintero',
      systemRole: SystemRole.RESEARCHER,
      passwordHash: coInvestigatorHash,
    },
    {
      id: ids.users.sofia,
      email: 'sofia.navarro@unicartagena.edu.co',
      fullName: 'Sofía Navarro Cabarcas',
      systemRole: SystemRole.RESEARCHER,
      passwordHash: coInvestigatorHash,
    },
    {
      id: ids.users.daniel,
      email: 'daniel.osorio@unicartagena.edu.co',
      fullName: 'Daniel Osorio Herrera',
      systemRole: SystemRole.RESEARCHER,
      passwordHash: coInvestigatorHash,
    },
  ];

  // La contraseña se reescribe en cada corrida: el seed es la fuente de verdad
  // de las credenciales de prueba.
  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: { ...user, isActive: true },
      update: { ...user, isActive: true },
    });
  }

  return users.length;
}

// ---------------------------------------------------------------------------
// Proyectos y miembros
// ---------------------------------------------------------------------------

async function seedProjects() {
  const projects = [
    {
      id: ids.projects.cienaga,
      title: 'Metales pesados y bioindicadores en la Ciénaga de la Virgen',
      description:
        'Evaluación de la concentración de metales pesados en agua y sedimentos de la Ciénaga de la Virgen, contrastada con bioindicadores de calidad ambiental en seis puntos de muestreo.',
      objectives:
        'Determinar la concentración de cadmio, plomo y mercurio en dos temporadas climáticas; correlacionar los resultados con índices de bioindicadores; formular recomendaciones de manejo para la autoridad ambiental.',
      status: ProjectStatus.IN_PROGRESS,
      startDate: day('2026-02-02'),
      endDate: day('2026-11-27'),
      budget: '48500000',
      createdById: ids.users.coordinator,
      closedAt: null,
    },
    {
      id: ids.projects.movilidad,
      title: 'Movilidad urbana sostenible en el centro histórico de Cartagena',
      description:
        'Caracterización de los patrones de desplazamiento en el centro histórico y evaluación de alternativas de movilidad de bajas emisiones.',
      objectives:
        'Levantar una línea base de movilidad peatonal y vehicular; estimar la huella de carbono asociada; proponer escenarios de intervención.',
      status: ProjectStatus.PLANNING,
      startDate: day('2026-10-01'),
      endDate: day('2027-06-30'),
      budget: '32000000',
      createdById: ids.users.coordinator,
      closedAt: null,
    },
    {
      id: ids.projects.desercion,
      title: 'Deserción estudiantil en programas de ingeniería',
      description:
        'Estudio de los factores asociados a la deserción temprana en los programas de ingeniería de la Universidad de Cartagena.',
      objectives:
        'Identificar factores académicos y socioeconómicos asociados a la deserción; construir un modelo predictivo de riesgo.',
      status: ProjectStatus.COMPLETED,
      startDate: day('2025-02-03'),
      endDate: day('2026-01-30'),
      budget: '18750000',
      createdById: ids.users.coordinator,
      closedAt: at('2026-01-30T22:00:00.000Z'),
    },
  ];

  for (const project of projects) {
    await prisma.project.upsert({
      where: { id: project.id },
      create: project,
      update: project,
    });
  }

  const members = [
    {
      projectId: ids.projects.cienaga,
      userId: ids.users.laura,
      role: ProjectRole.PRINCIPAL_INVESTIGATOR,
    },
    {
      projectId: ids.projects.cienaga,
      userId: ids.users.andres,
      role: ProjectRole.CO_INVESTIGATOR,
    },
    {
      projectId: ids.projects.cienaga,
      userId: ids.users.sofia,
      role: ProjectRole.CO_INVESTIGATOR,
    },
    {
      projectId: ids.projects.movilidad,
      userId: ids.users.carlos,
      role: ProjectRole.PRINCIPAL_INVESTIGATOR,
    },
    {
      projectId: ids.projects.movilidad,
      userId: ids.users.daniel,
      role: ProjectRole.CO_INVESTIGATOR,
    },
    {
      projectId: ids.projects.desercion,
      userId: ids.users.carlos,
      role: ProjectRole.PRINCIPAL_INVESTIGATOR,
    },
    {
      projectId: ids.projects.desercion,
      userId: ids.users.sofia,
      role: ProjectRole.CO_INVESTIGATOR,
    },
  ];

  for (const member of members) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: member.projectId, userId: member.userId } },
      create: member,
      update: { role: member.role },
    });
  }

  return { projects: projects.length, members: members.length };
}

// ---------------------------------------------------------------------------
// Cronograma: fases, tareas y precedencias
// ---------------------------------------------------------------------------

async function seedSchedule() {
  const phases = [
    {
      id: ids.phases.cienagaPlaneacion,
      projectId: ids.projects.cienaga,
      name: 'Planeación y revisión documental',
      description: 'Revisión del estado del arte y diseño metodológico del muestreo.',
      position: 1,
      status: PhaseStatus.COMPLETED,
      startDate: day('2026-02-02'),
      endDate: day('2026-04-10'),
    },
    {
      id: ids.phases.cienagaCampo,
      projectId: ids.projects.cienaga,
      name: 'Trabajo de campo y análisis de laboratorio',
      description:
        'Campañas de muestreo en las dos temporadas climáticas y procesamiento de las muestras.',
      position: 2,
      status: PhaseStatus.IN_PROGRESS,
      startDate: day('2026-04-13'),
      endDate: day('2026-09-30'),
    },
    {
      id: ids.phases.cienagaAnalisis,
      projectId: ids.projects.cienaga,
      name: 'Análisis de datos y divulgación',
      description:
        'Procesamiento estadístico, redacción del artículo y socialización de resultados.',
      position: 3,
      status: PhaseStatus.PENDING,
      startDate: day('2026-10-01'),
      endDate: day('2026-11-27'),
    },
    {
      id: ids.phases.movilidadFormulacion,
      projectId: ids.projects.movilidad,
      name: 'Formulación y aval institucional',
      description:
        'Preparación de la propuesta para la convocatoria interna y trámite del aval de ética.',
      position: 1,
      status: PhaseStatus.IN_PROGRESS,
      startDate: day('2026-08-17'),
      endDate: day('2026-09-30'),
    },
    {
      id: ids.phases.movilidadLevantamiento,
      projectId: ids.projects.movilidad,
      name: 'Levantamiento de información',
      description: 'Diseño y aplicación de los instrumentos de recolección en campo.',
      position: 2,
      status: PhaseStatus.PENDING,
      startDate: day('2026-10-01'),
      endDate: day('2027-02-26'),
    },
    {
      id: ids.phases.desercionCierre,
      projectId: ids.projects.desercion,
      name: 'Análisis y cierre',
      description: 'Modelado de los datos e informe final entregado a la vicerrectoría académica.',
      position: 1,
      status: PhaseStatus.COMPLETED,
      startDate: day('2025-09-01'),
      endDate: day('2026-01-30'),
    },
  ];

  for (const phase of phases) {
    await prisma.phase.upsert({
      where: { id: phase.id },
      create: phase,
      update: phase,
    });
  }

  const tasks = [
    {
      id: ids.tasks.revisionLiteratura,
      phaseId: ids.phases.cienagaPlaneacion,
      title: 'Revisión sistemática de literatura sobre metales pesados en cuerpos lagunares',
      description:
        'Búsqueda en Scopus y ScienceDirect, con matriz de síntesis de los artículos elegidos.',
      status: TaskStatus.DONE,
      priority: TaskPriority.MEDIUM,
      assigneeId: ids.users.sofia,
      createdById: ids.users.laura,
      startDate: day('2026-02-02'),
      dueDate: day('2026-03-20'),
      completedAt: at('2026-03-18T21:30:00.000Z'),
    },
    {
      id: ids.tasks.protocoloMuestreo,
      phaseId: ids.phases.cienagaPlaneacion,
      title: 'Diseño del protocolo de muestreo',
      description:
        'Definición de puntos, frecuencia, volúmenes y cadena de custodia de las muestras.',
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
      assigneeId: ids.users.laura,
      createdById: ids.users.laura,
      startDate: day('2026-03-02'),
      dueDate: day('2026-04-10'),
      completedAt: at('2026-04-08T15:45:00.000Z'),
    },
    {
      id: ids.tasks.muestreoSeca,
      phaseId: ids.phases.cienagaCampo,
      title: 'Campaña de muestreo — temporada seca',
      description: 'Recolección de agua y sedimentos en los seis puntos definidos en el protocolo.',
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
      assigneeId: ids.users.andres,
      createdById: ids.users.laura,
      startDate: day('2026-04-13'),
      dueDate: day('2026-06-15'),
      completedAt: at('2026-06-12T18:00:00.000Z'),
    },
    {
      id: ids.tasks.muestreoLluvias,
      phaseId: ids.phases.cienagaCampo,
      title: 'Campaña de muestreo — temporada de lluvias',
      description:
        'Repetición del muestreo en los mismos puntos para contrastar las dos temporadas.',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      assigneeId: ids.users.andres,
      createdById: ids.users.laura,
      startDate: day('2026-08-24'),
      dueDate: day('2026-09-30'),
      completedAt: null,
    },
    {
      id: ids.tasks.analisisLaboratorio,
      phaseId: ids.phases.cienagaCampo,
      title: 'Análisis de laboratorio por espectrometría de absorción atómica',
      description:
        'Cuantificación de cadmio, plomo y mercurio en las muestras de la primera campaña.',
      status: TaskStatus.IN_REVIEW,
      priority: TaskPriority.MEDIUM,
      assigneeId: ids.users.sofia,
      createdById: ids.users.laura,
      startDate: day('2026-06-22'),
      dueDate: day('2026-09-11'),
      completedAt: null,
    },
    {
      id: ids.tasks.procesamientoEstadistico,
      phaseId: ids.phases.cienagaAnalisis,
      title: 'Procesamiento estadístico de resultados',
      description: 'Pruebas de correlación entre concentraciones e índices de bioindicadores.',
      status: TaskStatus.BLOCKED,
      priority: TaskPriority.MEDIUM,
      assigneeId: ids.users.laura,
      createdById: ids.users.laura,
      startDate: day('2026-10-01'),
      dueDate: day('2026-10-30'),
      completedAt: null,
    },
    {
      id: ids.tasks.redaccionArticulo,
      phaseId: ids.phases.cienagaAnalisis,
      title: 'Redacción del artículo para revista indexada',
      description: 'Manuscrito en formato IMRyD dirigido a una revista Q2 de ciencias ambientales.',
      status: TaskStatus.TODO,
      priority: TaskPriority.LOW,
      assigneeId: ids.users.laura,
      createdById: ids.users.laura,
      startDate: day('2026-10-19'),
      dueDate: day('2026-11-27'),
      completedAt: null,
    },
    {
      id: ids.tasks.propuestaConvocatoria,
      phaseId: ids.phases.movilidadFormulacion,
      title: 'Elaborar la propuesta para la convocatoria interna',
      description: 'Documento con presupuesto y cronograma para el comité de investigación.',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      assigneeId: ids.users.carlos,
      createdById: ids.users.carlos,
      startDate: day('2026-08-17'),
      dueDate: day('2026-09-18'),
      completedAt: null,
    },
    {
      id: ids.tasks.avalEtica,
      phaseId: ids.phases.movilidadFormulacion,
      title: 'Radicar el aval del comité de ética',
      description: 'Formato de consentimiento informado y radicación ante el comité.',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      assigneeId: ids.users.daniel,
      createdById: ids.users.carlos,
      startDate: day('2026-09-21'),
      dueDate: day('2026-09-30'),
      completedAt: null,
    },
    {
      id: ids.tasks.instrumentoEncuesta,
      phaseId: ids.phases.movilidadLevantamiento,
      title: 'Diseñar el instrumento de encuesta de movilidad',
      description: 'Cuestionario de desplazamientos, con pilotaje sobre 30 personas.',
      status: TaskStatus.TODO,
      priority: TaskPriority.LOW,
      assigneeId: ids.users.daniel,
      createdById: ids.users.carlos,
      startDate: day('2026-10-01'),
      dueDate: day('2026-11-13'),
      completedAt: null,
    },
    {
      id: ids.tasks.informeFinal,
      phaseId: ids.phases.desercionCierre,
      title: 'Informe final de resultados',
      description: 'Informe con el modelo de riesgo entregado a la vicerrectoría académica.',
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
      assigneeId: ids.users.carlos,
      createdById: ids.users.carlos,
      startDate: day('2025-11-03'),
      dueDate: day('2026-01-30'),
      completedAt: at('2026-01-29T16:20:00.000Z'),
    },
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      create: task,
      update: task,
    });
  }

  const dependencies = [
    { taskId: ids.tasks.protocoloMuestreo, dependsOnTaskId: ids.tasks.revisionLiteratura },
    { taskId: ids.tasks.muestreoSeca, dependsOnTaskId: ids.tasks.protocoloMuestreo },
    { taskId: ids.tasks.muestreoLluvias, dependsOnTaskId: ids.tasks.muestreoSeca },
    { taskId: ids.tasks.procesamientoEstadistico, dependsOnTaskId: ids.tasks.analisisLaboratorio },
    { taskId: ids.tasks.redaccionArticulo, dependsOnTaskId: ids.tasks.procesamientoEstadistico },
    { taskId: ids.tasks.instrumentoEncuesta, dependsOnTaskId: ids.tasks.avalEtica },
  ];

  for (const dependency of dependencies) {
    await prisma.taskDependency.upsert({
      where: {
        taskId_dependsOnTaskId: {
          taskId: dependency.taskId,
          dependsOnTaskId: dependency.dependsOnTaskId,
        },
      },
      create: dependency,
      update: {},
    });
  }

  return { phases: phases.length, tasks: tasks.length, dependencies: dependencies.length };
}

// ---------------------------------------------------------------------------
// Avances
// ---------------------------------------------------------------------------

async function seedProgress() {
  const entries = [
    {
      id: ids.progress.seca,
      projectId: ids.projects.cienaga,
      taskId: ids.tasks.muestreoSeca,
      authorId: ids.users.andres,
      description:
        'Cerrada la campaña de temporada seca: 18 muestras de agua y 18 de sedimento en los seis puntos. El punto 4, en la desembocadura del caño, hubo que reprogramarlo por marea alta; queda registrado en la bitácora de campo.',
      createdAt: at('2026-06-12T22:10:00.000Z'),
    },
    {
      id: ids.progress.laboratorio,
      projectId: ids.projects.cienaga,
      taskId: ids.tasks.analisisLaboratorio,
      authorId: ids.users.sofia,
      description:
        'Procesadas 24 de las 36 muestras de la primera campaña. Los valores preliminares de plomo en los puntos 3 y 4 superan el límite de la norma; se repetirán esos ensayos por duplicado antes de reportar.',
      createdAt: at('2026-08-21T14:35:00.000Z'),
    },
    {
      id: ids.progress.comite,
      projectId: ids.projects.cienaga,
      taskId: null,
      authorId: ids.users.laura,
      description:
        'Reunión de seguimiento con la coordinación de investigación. Se aprueba extender la fase de campo hasta el 30 de septiembre por la ventana climática. El cronograma ya quedó ajustado en la plataforma.',
      createdAt: at('2026-09-02T13:00:00.000Z'),
    },
    {
      id: ids.progress.borradorPropuesta,
      projectId: ids.projects.movilidad,
      taskId: ids.tasks.propuestaConvocatoria,
      authorId: ids.users.carlos,
      description:
        'Primer borrador de la propuesta listo: marco teórico, metodología y presupuesto. Falta la carta de intención de la Secretaría de Movilidad Distrital.',
      createdAt: at('2026-09-04T20:15:00.000Z'),
    },
  ];

  for (const entry of entries) {
    await prisma.progress.upsert({
      where: { id: entry.id },
      create: entry,
      update: entry,
    });
  }

  return entries.length;
}

// ---------------------------------------------------------------------------
// Documentos
//
// Solo metadata: los archivos viven en un almacén independiente. Las rutas
// apuntan a ese almacén y el seed no crea nada en disco.
// ---------------------------------------------------------------------------

async function seedDocuments() {
  // El orden importa: la versión 2 referencia a la 1 por previousVersionId.
  const documents = [
    {
      id: ids.documents.protocoloV1,
      projectId: ids.projects.cienaga,
      taskId: ids.tasks.protocoloMuestreo,
      uploadedById: ids.users.laura,
      name: 'protocolo-muestreo.pdf',
      storagePath: 'uploads/projects/cienaga/protocolo-muestreo-v1.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 428_314,
      version: 1,
      previousVersionId: null,
      createdAt: at('2026-03-25T17:05:00.000Z'),
    },
    {
      id: ids.documents.protocoloV2,
      projectId: ids.projects.cienaga,
      taskId: ids.tasks.protocoloMuestreo,
      uploadedById: ids.users.laura,
      name: 'protocolo-muestreo.pdf',
      storagePath: 'uploads/projects/cienaga/protocolo-muestreo-v2.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 451_902,
      version: 2,
      previousVersionId: ids.documents.protocoloV1,
      createdAt: at('2026-04-08T15:40:00.000Z'),
    },
    {
      id: ids.documents.resultadosLaboratorio,
      projectId: ids.projects.cienaga,
      taskId: ids.tasks.analisisLaboratorio,
      uploadedById: ids.users.sofia,
      name: 'resultados-laboratorio-parcial.xlsx',
      storagePath: 'uploads/projects/cienaga/resultados-laboratorio-parcial-v1.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 96_755,
      version: 1,
      previousVersionId: null,
      createdAt: at('2026-08-21T14:40:00.000Z'),
    },
    {
      id: ids.documents.propuestaMovilidad,
      projectId: ids.projects.movilidad,
      taskId: ids.tasks.propuestaConvocatoria,
      uploadedById: ids.users.carlos,
      name: 'propuesta-movilidad-borrador.docx',
      storagePath: 'uploads/projects/movilidad/propuesta-movilidad-borrador-v1.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 132_480,
      version: 1,
      previousVersionId: null,
      createdAt: at('2026-09-04T20:20:00.000Z'),
    },
  ];

  for (const document of documents) {
    await prisma.document.upsert({
      where: { id: document.id },
      create: document,
      update: document,
    });
  }

  return documents.length;
}

// ---------------------------------------------------------------------------
// Mensajería
// ---------------------------------------------------------------------------

async function seedConversations() {
  // Chat de proyecto: type PROJECT con projectId.
  await prisma.conversation.upsert({
    where: { id: ids.conversations.cienaga },
    create: {
      id: ids.conversations.cienaga,
      type: ConversationType.PROJECT,
      projectId: ids.projects.cienaga,
    },
    update: { type: ConversationType.PROJECT, projectId: ids.projects.cienaga },
  });

  // Chat privado: projectId nulo y exactamente dos participantes.
  await prisma.conversation.upsert({
    where: { id: ids.conversations.lauraAndres },
    create: {
      id: ids.conversations.lauraAndres,
      type: ConversationType.PRIVATE,
      projectId: null,
    },
    update: { type: ConversationType.PRIVATE, projectId: null },
  });

  const participants = [
    {
      conversationId: ids.conversations.cienaga,
      userId: ids.users.laura,
      lastReadAt: at('2026-09-05T16:00:00.000Z'),
    },
    {
      conversationId: ids.conversations.cienaga,
      userId: ids.users.andres,
      lastReadAt: at('2026-09-05T12:30:00.000Z'),
    },
    {
      conversationId: ids.conversations.cienaga,
      userId: ids.users.sofia,
      lastReadAt: null,
    },
    {
      conversationId: ids.conversations.lauraAndres,
      userId: ids.users.laura,
      lastReadAt: at('2026-09-05T16:05:00.000Z'),
    },
    {
      conversationId: ids.conversations.lauraAndres,
      userId: ids.users.andres,
      lastReadAt: null,
    },
  ];

  for (const participant of participants) {
    await prisma.conversationParticipant.upsert({
      where: {
        conversationId_userId: {
          conversationId: participant.conversationId,
          userId: participant.userId,
        },
      },
      create: participant,
      update: { lastReadAt: participant.lastReadAt },
    });
  }

  const messages = [
    {
      id: ids.messages.proyecto1,
      conversationId: ids.conversations.cienaga,
      senderId: ids.users.laura,
      content:
        'Equipo, la coordinación aprobó extender la fase de campo hasta el 30 de septiembre. Ya ajusté el cronograma en la plataforma.',
      createdAt: at('2026-09-02T13:05:00.000Z'),
    },
    {
      id: ids.messages.proyecto2,
      conversationId: ids.conversations.cienaga,
      senderId: ids.users.andres,
      content:
        'Perfecto. Con esa fecha alcanzamos a cubrir las dos semanas de lluvia fuerte que pronostica el IDEAM.',
      createdAt: at('2026-09-02T13:12:00.000Z'),
    },
    {
      id: ids.messages.proyecto3,
      conversationId: ids.conversations.cienaga,
      senderId: ids.users.sofia,
      content:
        'Ojo con los puntos 3 y 4: el plomo salió por encima de la norma en el preliminar. Voy a repetir esos ensayos por duplicado antes de que reportemos nada.',
      createdAt: at('2026-09-03T15:40:00.000Z'),
    },
    {
      id: ids.messages.proyecto4,
      conversationId: ids.conversations.cienaga,
      senderId: ids.users.laura,
      content: '¿Necesitas que pidamos más reactivo para el duplicado?',
      createdAt: at('2026-09-03T15:52:00.000Z'),
    },
    {
      id: ids.messages.proyecto5,
      conversationId: ids.conversations.cienaga,
      senderId: ids.users.sofia,
      content:
        'Con lo que hay alcanza. Si tocara repetir la segunda campaña completa, ahí sí habría que pedir más.',
      createdAt: at('2026-09-03T16:10:00.000Z'),
    },
    {
      id: ids.messages.privado1,
      conversationId: ids.conversations.lauraAndres,
      senderId: ids.users.laura,
      content: 'Andrés, ¿la lancha para el muestreo del 24 ya quedó confirmada?',
      createdAt: at('2026-09-05T15:20:00.000Z'),
    },
    {
      id: ids.messages.privado2,
      conversationId: ids.conversations.lauraAndres,
      senderId: ids.users.andres,
      content: 'Sí, con el operador de siempre. Salimos a las 6:00 a. m. desde el muelle.',
      createdAt: at('2026-09-05T15:34:00.000Z'),
    },
  ];

  for (const message of messages) {
    await prisma.message.upsert({
      where: { id: message.id },
      create: message,
      update: message,
    });
  }

  return { conversations: 2, participants: participants.length, messages: messages.length };
}

// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------

async function seedNotifications() {
  const notifications = [
    {
      id: ids.notifications.tareaAsignada,
      userId: ids.users.andres,
      type: NotificationType.TASK_ASSIGNED,
      title: 'Se te asignó una tarea',
      body: 'Campaña de muestreo — temporada de lluvias, con fecha límite del 30 de septiembre.',
      resourceId: ids.tasks.muestreoLluvias,
      isRead: false,
      readAt: null,
      createdAt: at('2026-08-24T13:00:00.000Z'),
    },
    {
      id: ids.notifications.avanceCreado,
      userId: ids.users.laura,
      type: NotificationType.PROGRESS_CREATED,
      title: 'Nuevo avance registrado',
      body: 'Sofía Navarro Cabarcas registró un avance en el análisis de laboratorio.',
      resourceId: ids.progress.laboratorio,
      isRead: true,
      readAt: at('2026-08-21T18:02:00.000Z'),
      createdAt: at('2026-08-21T14:35:00.000Z'),
    },
    {
      id: ids.notifications.documentoSubido,
      userId: ids.users.daniel,
      type: NotificationType.DOCUMENT_UPLOADED,
      title: 'Nuevo documento en el proyecto',
      body: 'Carlos Beltrán Padilla subió propuesta-movilidad-borrador.docx.',
      resourceId: ids.documents.propuestaMovilidad,
      isRead: false,
      readAt: null,
      createdAt: at('2026-09-04T20:20:00.000Z'),
    },
  ];

  for (const notification of notifications) {
    await prisma.notification.upsert({
      where: { id: notification.id },
      create: notification,
      update: notification,
    });
  }

  return notifications.length;
}

// ---------------------------------------------------------------------------

async function main() {
  const users = await seedUsers();
  const projects = await seedProjects();
  const schedule = await seedSchedule();
  const progress = await seedProgress();
  const documents = await seedDocuments();
  const chat = await seedConversations();
  const notifications = await seedNotifications();

  console.log('Seed completado.');
  console.log(`  usuarios:       ${users}`);
  console.log(`  proyectos:      ${projects.projects} (miembros: ${projects.members})`);
  console.log(`  fases:          ${schedule.phases}`);
  console.log(`  tareas:         ${schedule.tasks} (dependencias: ${schedule.dependencies})`);
  console.log(`  avances:        ${progress}`);
  console.log(`  documentos:     ${documents}`);
  console.log(`  conversaciones: ${chat.conversations} (mensajes: ${chat.messages})`);
  console.log(`  notificaciones: ${notifications}`);
  console.log('');
  console.log('Credenciales de prueba:');
  console.log(`  coordinacion@unicartagena.edu.co    ${PASSWORDS.coordinator}     (coordinadora)`);
  console.log(
    `  laura.mendoza@unicartagena.edu.co   ${PASSWORDS.principal}    (investigadora principal)`,
  );
  console.log(
    `  carlos.beltran@unicartagena.edu.co  ${PASSWORDS.principal}    (investigador principal)`,
  );
  console.log(
    `  andres.pardo@unicartagena.edu.co    ${PASSWORDS.coInvestigator}  (coinvestigador)`,
  );
  console.log(
    `  sofia.navarro@unicartagena.edu.co   ${PASSWORDS.coInvestigator}  (coinvestigadora)`,
  );
  console.log(
    `  daniel.osorio@unicartagena.edu.co   ${PASSWORDS.coInvestigator}  (coinvestigador)`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('El seed falló:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
