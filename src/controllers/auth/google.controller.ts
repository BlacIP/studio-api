import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { signToken } from '../../lib/auth';
import { AppError } from '../../lib/errors';
import {
  GOOGLE_AUTH_ENABLED,
  GOOGLE_STATE_COOKIE,
  buildRedirect,
  exchangeGoogleToken,
  fetchGoogleProfile,
  getGoogleOAuthConfig,
} from '../../services/auth/auth-google';
import { upsertGoogleUser } from '../../services/auth/auth-google-user';
import { setStudioAuthCookie } from './utils';

export async function startGoogleAuth(_req: Request, res: Response) {
  if (!GOOGLE_AUTH_ENABLED) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  if (!clientId || !redirectUri) {
    res.status(500).json({ error: 'Google OAuth not configured' });
    return;
  }

  const state = randomBytes(16).toString('hex');
  res.cookie(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.VERCEL ? true : false,
    path: '/',
    maxAge: 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export async function handleGoogleCallback(req: Request, res: Response) {
  if (!GOOGLE_AUTH_ENABLED) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    res.status(500).json({ error: 'Google OAuth not configured' });
    return;
  }

  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const storedState = req.cookies?.[GOOGLE_STATE_COOKIE];

  if (!code || !state || !storedState || storedState !== state) {
    res.clearCookie(GOOGLE_STATE_COOKIE, { path: '/' });
    res.redirect(buildRedirect('/login', 'google_state'));
    return;
  }

  res.clearCookie(GOOGLE_STATE_COOKIE, { path: '/' });

  try {
    const tokenData = await exchangeGoogleToken({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });

    const profile = await fetchGoogleProfile(tokenData.access_token);

    const result = await upsertGoogleUser({
      providerId: profile.providerId,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    });

    const token = signToken({
      userId: result.userId,
      studioId: result.studioId,
      role: result.role,
      permissions: result.permissions,
    });

    setStudioAuthCookie(res, token);

    const nextPath = result.studioStatus === 'ACTIVE' ? '/dashboard' : '/onboarding';
    res.redirect(buildRedirect(nextPath));
  } catch (error) {
    if (error instanceof AppError) {
      res.redirect(buildRedirect('/login', error.message));
      return;
    }
    console.error('Google auth error', error);
    res.redirect(buildRedirect('/login', 'google_error'));
  }
}
