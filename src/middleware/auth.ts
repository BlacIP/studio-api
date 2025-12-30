import { Request, Response, NextFunction } from 'express';
import { verifyToken, AuthToken } from '../lib/auth';

export interface AuthedRequest extends Request {
  auth?: AuthToken;
}

export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const token =
    req.cookies?.token ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : null);

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  req.auth = payload;
  next();
}

export function requireStudio(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.auth?.studioId) {
    res.status(403).json({ error: 'Studio scope required' });
    return;
  }
  next();
}
