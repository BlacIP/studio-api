import { Request, Response, NextFunction } from 'express';

export function internalAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_SYNC_SECRET;
  const provided = req.headers['x-admin-sync-secret'];

  if (!expected || provided !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
