// Tipos del contrato de /api/v1/proyectos/:projectId/mensajes (`modules/chat`).

/**
 * Un mensaje, con la misma forma venga de donde venga: la respuesta REST y el
 * evento `chat:mensaje`. `createdAt` es un instante, en texto ISO.
 */
export interface ChatMessage {
  id: string;
  projectId: string;
  content: string;
  createdAt: string;
  sender: { id: string; fullName: string };
}

/** Respuesta de `GET`. Los mensajes llegan en orden cronológico. */
export interface MessagePage {
  messages: ChatMessage[];
  /** `null` cuando ya no queda historial. */
  nextCursor: string | null;
}

/** Parámetros de `GET`, con los nombres en español del contrato. */
export interface ListMessagesQuery {
  /** El id del mensaje más antiguo que el cliente ya tiene. */
  antes?: string;
  /** De 1 a 100; el backend usa 50 si no llega. */
  limite?: number;
}
