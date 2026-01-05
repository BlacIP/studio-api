export class AppError extends Error {
  status: number;
  expose: boolean;

  constructor(message: string, status = 500, expose = true) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.expose = expose;
  }
}
