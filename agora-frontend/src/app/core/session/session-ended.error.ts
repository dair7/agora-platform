/** La renovación no fue posible y la sesión terminó: hay que volver a entrar. */
export class SessionEndedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('La sesión terminó', options);
    this.name = 'SessionEndedError';
  }
}
