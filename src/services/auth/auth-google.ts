import { AppError } from '../../lib/errors';

export const GOOGLE_STATE_COOKIE = 'studio_google_oauth_state';
export const GOOGLE_AUTH_ENABLED = process.env.GOOGLE_AUTH_ENABLED === 'true';

export function getStudioAppUrl() {
  const base =
    process.env.STUDIO_APP_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000';
  return base.replace(/\/$/, '');
}

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}

export function buildRedirect(path: string, error?: string) {
  const base = getStudioAppUrl();
  const url = new URL(`${base}${path}`);
  if (error) {
    url.searchParams.set('error', error);
  }
  return url.toString();
}

export async function exchangeGoogleToken({
  code,
  clientId,
  clientSecret,
  redirectUri,
}: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    throw new AppError('google_token', 400);
  }

  return tokenRes.json();
}

export async function fetchGoogleProfile(accessToken: string) {
  const userInfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userInfoRes.ok) {
    throw new AppError('google_userinfo', 400);
  }

  const profile = await userInfoRes.json();
  const providerId = profile.sub as string | undefined;
  const email = profile.email as string | undefined;
  const emailVerified = profile.email_verified as boolean | undefined;
  const displayName = profile.name as string | undefined;
  const avatarUrl = profile.picture as string | undefined;

  if (!providerId || !email || !emailVerified) {
    throw new AppError('google_email', 400);
  }

  return { providerId, email, displayName, avatarUrl };
}
