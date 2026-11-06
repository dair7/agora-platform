// Tipos del contrato de /api/v1/conversaciones (`modules/conversations`).

import type { SystemRole } from '../session/session.types';

/** Con quién se puede empezar una conversación. Sin correo: es lo justo para elegir. */
export interface Contact {
  id: string;
  fullName: string;
  systemRole: SystemRole;
}

export interface ConversationSummary {
  id: string;
  otherUser: { id: string; fullName: string; isActive: boolean };
  /** `null` en una conversación abierta en la que nadie ha escrito. */
  lastMessage: { id: string; content: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
}
