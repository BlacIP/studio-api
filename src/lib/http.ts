import type { Response } from 'express';

export function success<T>(res: Response, data: T, status = 200): Response<T> {
  return res.status(status).json(data);
}

export function fail(
  res: Response,
  error: string,
  status = 500,
  extras?: Record<string, unknown>
): Response {
  return res.status(status).json({ error, ...extras });
}
