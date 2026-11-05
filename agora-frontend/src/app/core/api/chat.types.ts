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
  /**
   * Para pedir el bloque siguiente en el mismo sentido. `null` cuando no queda nada:
   * con `despues`, es lo que dice que el cliente se puso al día.
   */
  nextCursor: string | null;
}

/** Parámetros de `GET`, con los nombres en español del contrato. */
export interface ListMessagesQuery {
  /** El id del mensaje más antiguo que el cliente ya tiene. */
  antes?: string;
  /** El id del más nuevo: pide lo que vino después. No va junto con `antes`. */
  despues?: string;
  /** De 1 a 100; el backend usa 50 si no llega. */
  limite?: number;
}

/** La marca de lectura de quien pregunta. El conteo lo calcula el servidor. */
export interface ReadState {
  lastReadAt: string | null;
  unreadCount: number;
}
