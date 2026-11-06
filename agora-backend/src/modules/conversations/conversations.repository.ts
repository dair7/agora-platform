import { ConversationType, Prisma, SystemRole } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { AuthUser } from '../../middlewares/authenticate.js';
import { visibleProjectsFilter } from '../projects/projects.repository.js';

/**
 * Con quién puede **empezar** una conversación esta persona. La coordinación, con
 * cualquiera. Quien investiga, con la coordinación y con quien comparte un proyecto: ese
 * «comparte» es la regla de oro, así que sale de su única traducción.
 *
 * Solo decide empezar: una conversación que ya existe sigue usándose aunque dejen de
 * compartir proyecto.
 */
const contactsOf = (user: AuthUser): Prisma.UserWhereInput => ({
  isActive: true,
  id: { not: user.id },
  ...(user.systemRole !== SystemRole.COORDINATOR && {
    OR: [
      { systemRole: SystemRole.COORDINATOR },
      { memberships: { some: { project: visibleProjectsFilter(user) } } },
    ],
  }),
});

// Sin correo: es lo justo para elegir a alguien, y la lista no enseña más de lo necesario.
const contactSelect = { id: true, fullName: true, systemRole: true } satisfies Prisma.UserSelect;

export type Contact = Prisma.UserGetPayload<{ select: typeof contactSelect }>;

export const findContacts = (user: AuthUser): Promise<Contact[]> =>
  prisma.user.findMany({
    where: contactsOf(user),
    select: contactSelect,
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
  });

/** Separa este bloqueo de cualquier otro que use `pg_advisory_xact_lock` en la base. */
const PAIR_LOCK_SCOPE = 'conversacion-privada';

/**
 * Busca la conversación de la pareja, y si no hay la crea. `null` si no existe y esta
 * persona no puede empezarla.
 *
 * El esquema no lo impide: `project_id` es único, pero los nulos no chocan entre sí. Sin
 * el bloqueo, dos personas abriendo a la vez verían las dos que no hay ninguna, y el
 * historial quedaría partido en dos. No hay fila que bloquear, porque es justo la que
 * falta: por eso un bloqueo de aviso, que se suelta solo al acabar la transacción. Los
 * identificadores van ordenados para que las dos personas obtengan la misma clave.
 */
export const openPrivateConversation = (
  user: AuthUser,
  otherId: string,
): Promise<{ id: string; created: boolean } | null> =>
  prisma.$transaction(async (tx) => {
    const [first, second] = [user.id, otherId].sort();
    const key = `${PAIR_LOCK_SCOPE}:${first}:${second}`;

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`;

    const existing = await tx.conversation.findFirst({
      where: {
        type: ConversationType.PRIVATE,
        AND: [
          { participants: { some: { userId: first } } },
          { participants: { some: { userId: second } } },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      return { id: existing.id, created: false };
    }

    const contact = await tx.user.findFirst({
      where: { AND: [{ id: otherId }, contactsOf(user)] },
      select: { id: true },
    });

    if (!contact) {
      return null;
    }

    const { id } = await tx.conversation.create({
      data: {
        type: ConversationType.PRIVATE,
        participants: { create: [{ userId: first }, { userId: second }] },
      },
      select: { id: true },
    });

    return { id, created: true };
  });

/**
 * Los participantes de una conversación privada, solo si esta persona es uno de ellos. El
 * tipo no sobra: sin él, estas rutas abrirían los chats de proyecto, saltándose su regla
 * de proyecto cerrado. El identificador llega por la ruta: quien manda es esta fila.
 */
export const findParticipants = async (
  conversationId: string,
  userId: string,
): Promise<{ id: string; isActive: boolean }[] | null> => {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      type: ConversationType.PRIVATE,
      participants: { some: { userId } },
    },
    select: { participants: { select: { user: { select: { id: true, isActive: true } } } } },
  });

  return conversation?.participants.map(({ user }) => user) ?? null;
};

export interface SummaryRow {
  id: string;
  other_id: string;
  other_name: string;
  other_active: boolean;
  last_id: string | null;
  last_content: string | null;
  last_at: Date | null;
  last_sender_id: string | null;
  unread: number;
}

/**
 * Una consulta para toda la lista: el último mensaje y lo no leído de cada conversación
 * van aquí y no en una petición por fila. Cuenta como `countUnread`: lo ajeno posterior a
 * la marca, o todo lo ajeno si no hay marca.
 */
const summaries = (userId: string, filter: Prisma.Sql): Promise<SummaryRow[]> =>
  prisma.$queryRaw<SummaryRow[]>`
    SELECT
      c.id,
      u.id AS other_id,
      u.full_name AS other_name,
      u.is_active AS other_active,
      last.id AS last_id,
      last.content AS last_content,
      last.created_at AS last_at,
      last.sender_id AS last_sender_id,
      (
        SELECT COUNT(*)
        FROM messages m
        WHERE m.conversation_id = c.id
          AND m.sender_id <> me.user_id
          AND (me.last_read_at IS NULL OR m.created_at > me.last_read_at)
      )::int AS unread
    FROM conversation_participants me
    JOIN conversations c ON c.id = me.conversation_id AND c.type = 'PRIVATE'
    JOIN conversation_participants other
      ON other.conversation_id = c.id AND other.user_id <> me.user_id
    JOIN users u ON u.id = other.user_id
    LEFT JOIN LATERAL (
      SELECT m.id, m.content, m.created_at, m.sender_id
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 1
    ) last ON true
    WHERE me.user_id = ${userId}::uuid ${filter}
    ORDER BY last.created_at DESC NULLS LAST, c.id ASC
  `;

/**
 * Solo las que tienen mensajes. Abrir una conversación crea la fila, y sin esto bastaría
 * con abrirla para aparecer en la lista de la otra persona sin haberle dicho nada.
 */
export const findSummaries = (userId: string): Promise<SummaryRow[]> =>
  summaries(userId, Prisma.sql`AND last.id IS NOT NULL`);

export const findSummary = async (
  userId: string,
  conversationId: string,
): Promise<SummaryRow | undefined> => {
  const [row] = await summaries(userId, Prisma.sql`AND c.id = ${conversationId}::uuid`);

  return row;
};
