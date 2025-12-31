import { Request, Response, NextFunction } from 'express';

function isVercelCron(req: Request): boolean {
  const cronHeader = req.headers['x-vercel-cron'];
  if (cronHeader === '1') return true;
  const userAgent = String(req.headers['user-agent'] || '').toLowerCase();
  return userAgent.includes('vercel-cron');
}

export function cronAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_SYNC_SECRET;
  const provided = req.headers['x-admin-sync-secret'];
  if (expected && provided === expected) {
    next();
    return;
  }

  const allowCron = process.env.ALLOW_CRON === 'true';
  if (allowCron && isVercelCron(req)) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}
