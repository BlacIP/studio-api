import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { signToken } from '../lib/auth';
import { pool } from '../lib/db';
import { StudioUser } from '../types';
import { syncStudioOwnerToAdmin, syncStudioToAdmin } from '../lib/admin-sync';
import { authMiddleware } from '../middleware/auth';

const router = Router();

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
  const { email, password } = req.body || {};
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

    const studioInsert = await client.query(
      `INSERT INTO studios (id, name, slug, status)
       VALUES ($1, $2, $3, 'ONBOARDING')
       RETURNING id, name, slug, status, plan, created_at`,
      [studioId, studioName, studioSlug]
    );

    const userInsert = await client.query(
      `INSERT INTO studio_users (id, email, password_hash, role, permissions, studio_id, auth_provider)
       VALUES ($1, $2, $3, 'OWNER', $4, $5, 'local')
       RETURNING id, email, role, auth_provider, display_name, avatar_url, created_at`,
      [userId, email, passwordHash, [], studioId]
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
      },
    });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Internal server error' });
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
