import type { Response } from 'express';

export function setStudioAuthCookie(res: Response, token: string) {
  res.cookie('studio_token', token, {
    httpOnly: true,
    sameSite:
      process.env.NODE_ENV === 'production' || process.env.VERCEL ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.VERCEL ? true : false,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearStudioAuthCookie(res: Response) {
  res.clearCookie('studio_token', {
    httpOnly: true,
    sameSite:
      process.env.NODE_ENV === 'production' || process.env.VERCEL ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.VERCEL ? true : false,
    path: '/',
  });
}
