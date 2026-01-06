import type { Request, Response } from 'express';
import { clearStudioAuthCookie } from './utils';

export function logoutStudio(_req: Request, res: Response) {
  clearStudioAuthCookie(res);
  res.json({ success: true });
}
