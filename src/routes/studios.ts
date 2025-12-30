import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../lib/db';
import { syncStudioToAdmin } from '../lib/admin-sync';

const router = Router();

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Return the current studio info for the logged-in user
/**
 * @openapi
 * /api/studios/me:
 *   get:
 *     summary: Get current studio
 *     tags: [Studios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Studio details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Studio'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Studio scope required
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
router.get('/me', authMiddleware, async (req: any, res) => {
  try {
    const studioId = req.auth?.studioId;
    if (!studioId) {
      res.status(403).json({ error: 'Studio scope required' });
      return;
    }
    const result = await pool.query('SELECT id, name, slug, status FROM studios WHERE id = $1', [studioId]);
    const studio = result.rows[0];
    if (!studio) {
      res.status(404).json({ error: 'Studio not found' });
      return;
    }
    res.json(studio);
  } catch (err) {
    console.error('Studio me error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/studios/me:
 *   patch:
 *     summary: Update studio onboarding details
 *     tags: [Studios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StudioOnboardingRequest'
 *     responses:
 *       200:
 *         description: Studio updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Studio'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Studio scope required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Slug already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/me', authMiddleware, async (req: any, res) => {
  try {
    const studioId = req.auth?.studioId;
    if (!studioId) {
      res.status(403).json({ error: 'Studio scope required' });
      return;
    }

    const { name, slug } = req.body || {};
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const finalSlug = slug ? toSlug(slug) : toSlug(name);
    if (!finalSlug) {
      res.status(400).json({ error: 'slug is required' });
      return;
    }

    const existing = await pool.query(
      'SELECT id FROM studios WHERE slug = $1 AND id <> $2',
      [finalSlug, studioId]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Slug already in use' });
      return;
    }

    const update = await pool.query(
      `UPDATE studios
       SET name = $1, slug = $2, status = 'ACTIVE'
       WHERE id = $3
       RETURNING id, name, slug, status, plan, created_at`,
      [name, finalSlug, studioId]
    );

    const studio = update.rows[0];
    await syncStudioToAdmin({
      id: studio.id,
      name: studio.name,
      slug: studio.slug,
      status: studio.status,
      plan: studio.plan || 'free',
      created_at: studio.created_at,
    });

    res.json(studio);
  } catch (err) {
    console.error('Studio update error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
