import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signToken } from '../lib/auth';
import { pool } from '../lib/db';
import { StudioUser } from '../types';

const router = Router();

// Studio-scoped login
router.post('/login', async (req, res) => {
  try {
    const { email, password, studioSlug } = req.body || {};
    if (!email || !password || !studioSlug) {
      res.status(400).json({ error: 'email, password, and studioSlug are required' });
      return;
    }

    // Find studio
    const studioRes = await pool.query('SELECT id, name, slug, status FROM studios WHERE slug = $1', [studioSlug]);
    const studio = studioRes.rows[0];
    if (!studio) {
      res.status(404).json({ error: 'Studio not found' });
      return;
    }
    if (studio.status && studio.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Studio not active' });
      return;
    }

    // Find user in studio
    const userRes = await pool.query<StudioUser>(
      'SELECT id, email, password_hash, role, permissions, studio_id FROM studio_users WHERE email = $1 AND studio_id = $2',
      [email, studio.id]
    );
    const user = userRes.rows[0];
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken({
      userId: user.id,
      studioId: studio.id,
      role: user.role,
      permissions: user.permissions,
    });

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: process.env.VERCEL ? 'none' : 'lax',
      secure: !!process.env.VERCEL,
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
        studioId: studio.id,
        studioSlug: studio.slug,
        studioName: studio.name,
      },
    });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
