import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID, randomBytes } from 'crypto';
import { signToken } from '../lib/auth';
import { pool } from '../lib/db';
import { StudioUser } from '../types';
import { syncStudioOwnerToAdmin, syncStudioToAdmin } from '../lib/admin-sync';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const GOOGLE_STATE_COOKIE = 'studio_google_oauth_state';
const GOOGLE_AUTH_ENABLED = process.env.GOOGLE_AUTH_ENABLED === 'true';

function getStudioAppUrl() {
  const base =
    process.env.STUDIO_APP_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000';
  return base.replace(/\/$/, '');
}

function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}

function buildRedirect(path: string, error?: string) {
  const base = getStudioAppUrl();
  const url = new URL(`${base}${path}`);
  if (error) {
    url.searchParams.set('error', error);
  }
  return url.toString();
}

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new studio owner
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthRegisterRequest'
 *     responses:
 *       201:
 *         description: Registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthRegisterResponse'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM studio_users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const studioId = randomUUID();
    const userId = randomUUID();
    const studioName = 'Untitled Studio';
    const studioSlug = `studio-${studioId.slice(0, 8)}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const cleanedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';

    const studioInsert = await client.query(
      `INSERT INTO studios (id, name, slug, status)
       VALUES ($1, $2, $3, 'ONBOARDING')
       RETURNING id, name, slug, status, plan, created_at`,
      [studioId, studioName, studioSlug]
    );

    const userInsert = await client.query(
      `INSERT INTO studio_users (id, email, password_hash, role, permissions, studio_id, auth_provider, display_name)
       VALUES ($1, $2, $3, 'OWNER', $4, $5, 'local', $6)
       RETURNING id, email, role, auth_provider, display_name, avatar_url, created_at`,
      [userId, email, passwordHash, [], studioId, cleanedDisplayName || null]
    );

    await client.query('COMMIT');

    const token = signToken({
      userId,
      studioId,
      role: 'OWNER',
      permissions: [],
    });

    res.cookie('studio_token', token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' || process.env.VERCEL ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production' || process.env.VERCEL ? true : false,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const studioRow = studioInsert.rows[0];
    const ownerRow = userInsert.rows[0];
    await syncStudioToAdmin({
      id: studioRow.id,
      name: studioRow.name,
      slug: studioRow.slug,
      status: studioRow.status,
      plan: studioRow.plan,
      created_at: studioRow.created_at,
    });
    await syncStudioOwnerToAdmin({
      studioId: studioRow.id,
      ownerId: ownerRow.id,
      email: ownerRow.email,
      role: ownerRow.role,
      authProvider: ownerRow.auth_provider,
      displayName: ownerRow.display_name,
      avatarUrl: ownerRow.avatar_url,
      createdAt: ownerRow.created_at,
    });

    res.status(201).json({
      token,
      user: {
        id: userId,
        email,
        role: 'OWNER',
        permissions: [],
        studioId,
        studioSlug: studioRow.slug,
        studioName: studioRow.name,
        studioStatus: 'ONBOARDING',
        displayName: ownerRow.display_name,
        avatarUrl: ownerRow.avatar_url,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Register error', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Studio login
/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Studio user login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthLoginRequest'
 *     responses:
 *       200:
 *         description: Authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthLoginResponse'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Studio not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, studioSlug } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }

    const params: Array<string> = [email];
    let where = 'WHERE u.email = $1';
    if (studioSlug) {
      params.push(studioSlug);
      where += ' AND s.slug = $2';
    }

    const userRes = await pool.query<StudioUser & {
      studio_slug: string | null;
      studio_name: string | null;
      studio_status: string | null;
    }>(
      `SELECT u.id, u.email, u.password_hash, u.role, u.permissions, u.studio_id, u.auth_provider,
              u.display_name, u.avatar_url,
              s.slug AS studio_slug, s.name AS studio_name, s.status AS studio_status
       FROM studio_users u
       JOIN studios s ON s.id = u.studio_id
       ${where}`,
      params
    );

    if (userRes.rows.length === 0) {
      res.status(studioSlug ? 404 : 401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!studioSlug && userRes.rows.length > 1) {
      res.status(409).json({ error: 'Multiple studios found. Provide studioSlug.' });
      return;
    }

    const user = userRes.rows[0];
    if (user.auth_provider && user.auth_provider !== 'local') {
      res.status(401).json({ error: 'Use Google login for this account' });
      return;
    }
    if (!user.password_hash) {
      res.status(401).json({ error: 'Password not set for this account' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (user.studio_status && user.studio_status === 'SUSPENDED') {
      res.status(403).json({ error: 'Studio not active' });
      return;
    }

    const token = signToken({
      userId: user.id,
      studioId: user.studio_id,
      role: user.role,
      permissions: user.permissions || undefined,
    });

    res.cookie('studio_token', token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' || process.env.VERCEL ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production' || process.env.VERCEL ? true : false,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        studioId: user.studio_id,
        studioSlug: user.studio_slug,
        studioName: user.studio_name,
        studioStatus: user.studio_status,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
      },
    });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/google:
 *   get:
 *     summary: Start Google OAuth flow
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth
 */
router.get('/google', (_req, res) => {
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
});

/**
 * @openapi
 * /api/auth/google/callback:
 *   get:
 *     summary: Handle Google OAuth callback
 *     tags: [Auth]
 *     responses:
 *       302:
 *         description: Redirect to studio app
 */
router.get('/google/callback', async (req, res) => {
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
      console.error('Google token exchange failed', await tokenRes.text());
      res.redirect(buildRedirect('/login', 'google_token'));
      return;
    }

    const tokenData = await tokenRes.json();
    const userInfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      console.error('Google userinfo fetch failed', await userInfoRes.text());
      res.redirect(buildRedirect('/login', 'google_userinfo'));
      return;
    }

    const profile = await userInfoRes.json();
    const providerId = profile.sub as string | undefined;
    const email = profile.email as string | undefined;
    const emailVerified = profile.email_verified as boolean | undefined;
    const displayName = profile.name as string | undefined;
    const avatarUrl = profile.picture as string | undefined;

    if (!providerId || !email || !emailVerified) {
      res.redirect(buildRedirect('/login', 'google_email'));
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const providerRes = await client.query<StudioUser & {
        studio_slug: string | null;
        studio_name: string | null;
        studio_status: string | null;
      }>(
        `SELECT u.id, u.email, u.role, u.permissions, u.studio_id, u.auth_provider, u.provider_id,
                s.slug AS studio_slug, s.name AS studio_name, s.status AS studio_status
         FROM studio_users u
         JOIN studios s ON s.id = u.studio_id
         WHERE u.auth_provider = 'google' AND u.provider_id = $1`,
        [providerId]
      );

      let userId: string;
      let studioId: string;
      let studioSlug: string;
      let studioName: string;
      let studioStatus: string;
      let role: string;
      let permissions: string[] = [];

      if (providerRes.rows.length > 0) {
        const row = providerRes.rows[0];
        userId = row.id;
        studioId = row.studio_id;
        studioSlug = row.studio_slug || '';
        studioName = row.studio_name || '';
        studioStatus = row.studio_status || 'ONBOARDING';
        role = row.role;
        permissions = row.permissions || [];

        await client.query(
          `UPDATE studio_users
           SET email = $1, display_name = $2, avatar_url = $3
           WHERE id = $4`,
          [email, displayName || null, avatarUrl || null, userId]
        );
      } else {
        const emailRes = await client.query<StudioUser & {
          studio_slug: string | null;
          studio_name: string | null;
          studio_status: string | null;
        }>(
          `SELECT u.id, u.email, u.role, u.permissions, u.studio_id, u.auth_provider, u.provider_id,
                  s.slug AS studio_slug, s.name AS studio_name, s.status AS studio_status
           FROM studio_users u
           JOIN studios s ON s.id = u.studio_id
           WHERE u.email = $1`,
          [email]
        );

        if (emailRes.rows.length > 0) {
          const row = emailRes.rows[0];
          if (row.auth_provider !== 'google') {
            await client.query('ROLLBACK');
            res.redirect(buildRedirect('/login', 'use_password'));
            return;
          }

          userId = row.id;
          studioId = row.studio_id;
          studioSlug = row.studio_slug || '';
          studioName = row.studio_name || '';
          studioStatus = row.studio_status || 'ONBOARDING';
          role = row.role;
          permissions = row.permissions || [];

          await client.query(
            `UPDATE studio_users
             SET provider_id = $1, display_name = $2, avatar_url = $3
             WHERE id = $4`,
            [providerId, displayName || null, avatarUrl || null, userId]
          );
        } else {
          const studioIdNew = randomUUID();
          const userIdNew = randomUUID();
          const studioNameNew = 'Untitled Studio';
          const studioSlugNew = `studio-${studioIdNew.slice(0, 8)}`;

          const studioInsert = await client.query(
            `INSERT INTO studios (id, name, slug, status)
             VALUES ($1, $2, $3, 'ONBOARDING')
             RETURNING id, name, slug, status, plan, created_at`,
            [studioIdNew, studioNameNew, studioSlugNew]
          );

          await client.query(
            `INSERT INTO studio_users (id, email, role, permissions, studio_id, auth_provider, provider_id, display_name, avatar_url)
             VALUES ($1, $2, 'OWNER', $3, $4, 'google', $5, $6, $7)`,
            [userIdNew, email, [], studioIdNew, providerId, displayName || null, avatarUrl || null]
          );

          const studioRow = studioInsert.rows[0];
          userId = userIdNew;
          studioId = studioRow.id;
          studioSlug = studioRow.slug;
          studioName = studioRow.name;
          studioStatus = studioRow.status;
          role = 'OWNER';
          permissions = [];

          await syncStudioToAdmin({
            id: studioRow.id,
            name: studioRow.name,
            slug: studioRow.slug,
            status: studioRow.status,
            plan: studioRow.plan,
            created_at: studioRow.created_at,
          });

          await syncStudioOwnerToAdmin({
            studioId: studioRow.id,
            ownerId: userIdNew,
            email,
            role: 'OWNER',
            authProvider: 'google',
            displayName: displayName || null,
            avatarUrl: avatarUrl || null,
            createdAt: studioRow.created_at,
          });
        }
      }

      await client.query('COMMIT');

      const token = signToken({
        userId,
        studioId,
        role,
        permissions,
      });

      res.cookie('studio_token', token, {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' || process.env.VERCEL ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production' || process.env.VERCEL ? true : false,
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const nextPath = studioStatus === 'ACTIVE' ? '/dashboard' : '/onboarding';
      res.redirect(buildRedirect(nextPath));
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Google auth error', err);
      res.redirect(buildRedirect('/login', 'google_error'));
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Google auth error', err);
    res.redirect(buildRedirect('/login', 'google_error'));
  }
});

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Get current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user details
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.auth?.userId;
    const studioId = req.auth?.studioId;
    if (!userId || !studioId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await pool.query(
      `SELECT u.id,
              u.email,
              u.role,
              u.permissions,
              u.display_name,
              u.avatar_url,
              s.slug AS studio_slug,
              s.name AS studio_name,
              s.status AS studio_status
       FROM studio_users u
       JOIN studios s ON s.id = u.studio_id
       WHERE u.id = $1 AND u.studio_id = $2`,
      [userId, studioId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      email: row.email,
      name: row.display_name || row.studio_name || row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      role: row.role,
      permissions: row.permissions,
      studioId: studioId,
      studioSlug: row.studio_slug,
      studioName: row.studio_name,
      studioStatus: row.studio_status,
    });
  } catch (err) {
    console.error('Auth me error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/me:
 *   patch:
 *     summary: Update current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *             required:
 *               - displayName
 *     responses:
 *       200:
 *         description: Updated user details
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 */
router.patch('/me', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.auth?.userId;
    const studioId = req.auth?.studioId;
    if (!userId || !studioId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const displayName = req.body?.displayName;
    if (typeof displayName !== 'string') {
      res.status(400).json({ error: 'displayName is required' });
      return;
    }

    const cleanedName = displayName.trim();
    if (!cleanedName) {
      res.status(400).json({ error: 'displayName is required' });
      return;
    }

    const result = await pool.query(
      `UPDATE studio_users u
       SET display_name = $1
       FROM studios s
       WHERE u.id = $2 AND u.studio_id = $3 AND s.id = u.studio_id
       RETURNING u.id,
                 u.email,
                 u.role,
                 u.auth_provider,
                 u.display_name,
                 u.avatar_url,
                 u.created_at,
                 s.slug AS studio_slug,
                 s.name AS studio_name,
                 s.status AS studio_status`,
      [cleanedName, userId, studioId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const row = result.rows[0];
    await syncStudioOwnerToAdmin({
      studioId,
      ownerId: row.id,
      email: row.email,
      role: row.role,
      authProvider: row.auth_provider,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
    });

    res.json({
      user: {
        id: row.id,
        email: row.email,
        name: row.display_name || row.studio_name || row.email,
        role: row.role,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        studioId,
        studioSlug: row.studio_slug,
        studioName: row.studio_name,
        studioStatus: row.studio_status,
      },
    });
  } catch (err) {
    console.error('Auth update error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Logout current user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post('/logout', (_req, res) => {
  res.clearCookie('studio_token', {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' || process.env.VERCEL ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.VERCEL ? true : false,
    path: '/',
  });
  res.json({ success: true });
});

export default router;
