import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../lib/db';
import { syncStudioToAdmin } from '../lib/admin-sync';
import cloudinary from '../lib/cloudinary';
import { signStudioLogoUploadRequest } from '../lib/cloudinary';

const router = Router();

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Public studio profile for gallery/header usage
/**
 * @openapi
 * /api/studios/public/{slug}:
 *   get:
 *     summary: Get public studio profile
 *     tags: [Studios]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Public studio profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StudioPublic'
 *       404:
 *         description: Studio not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/public/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await pool.query(
      `SELECT name,
              slug,
              status,
              logo_url,
              contact_email,
              contact_phone,
              address,
              social_links
       FROM studios
       WHERE slug = $1`,
      [slug]
    );

    if (result.rows.length === 0 || result.rows[0].status !== 'ACTIVE') {
      res.status(404).json({ error: 'Studio not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Studio public error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/studios/public/{slug}/clients:
 *   get:
 *     summary: List public studio galleries
 *     tags: [Studios]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Public client list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StudioPublicClient'
 *       404:
 *         description: Studio not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/public/:slug/clients', async (req, res) => {
  try {
    const { slug } = req.params;
    const studioResult = await pool.query('SELECT id FROM studios WHERE slug = $1 AND status = $2', [slug, 'ACTIVE']);
    if (studioResult.rows.length === 0) {
      res.status(404).json({ error: 'Studio not found' });
      return;
    }

    const studioId = studioResult.rows[0].id;
    const result = await pool.query(
      `SELECT c.id,
              c.name,
              c.slug,
              c.event_date,
              c.status,
              c.subheading,
              c.header_media_url,
              c.header_media_type,
              COUNT(p.id)::int AS photo_count
       FROM clients c
       LEFT JOIN photos p ON p.client_id = c.id
       WHERE c.studio_id = $1
         AND c.status = 'ACTIVE'
       GROUP BY c.id
       ORDER BY c.event_date DESC NULLS LAST, c.created_at DESC`,
      [studioId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Studio public clients error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSocialLinks(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, val]) => [key, typeof val === 'string' ? val.trim() : ''])
    .filter(([, val]) => val);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries) as Record<string, string>;
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
    const result = await pool.query(
      `SELECT id,
              name,
              slug,
              status,
              plan,
              logo_url,
              logo_public_id,
              contact_email,
              contact_phone,
              address,
              social_links
       FROM studios
       WHERE id = $1`,
      [studioId]
    );
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

    const {
      name,
      slug,
      logo_url,
      logo_public_id,
      clear_logo,
      contact_email,
      contact_phone,
      address,
      social_links,
    } = req.body || {};
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

    const normalizedLogoUrl = normalizeOptionalString(logo_url);
    const normalizedLogoPublicId = normalizeOptionalString(logo_public_id);
    const normalizedContactEmail = normalizeOptionalString(contact_email);
    const normalizedContactPhone = normalizeOptionalString(contact_phone);
    const normalizedAddress = normalizeOptionalString(address);
    const normalizedSocialLinks = normalizeSocialLinks(social_links);
    const clearLogo = clear_logo === true;

    const existingLogoRes = await pool.query(
      'SELECT logo_public_id FROM studios WHERE id = $1',
      [studioId]
    );
    const existingLogoPublicId = existingLogoRes.rows[0]?.logo_public_id || null;

    const update = await pool.query(
      `UPDATE studios
       SET name = $1,
           slug = $2,
           status = 'ACTIVE',
           logo_url = CASE WHEN $10 THEN NULL ELSE COALESCE($3, logo_url) END,
           logo_public_id = CASE WHEN $10 THEN NULL ELSE COALESCE($4, logo_public_id) END,
           contact_email = COALESCE($5, contact_email),
           contact_phone = COALESCE($6, contact_phone),
           address = COALESCE($7, address),
           social_links = COALESCE($8, social_links)
       WHERE id = $9
       RETURNING id, name, slug, status, plan, created_at, logo_url, logo_public_id, contact_email, contact_phone, address, social_links`,
      [
        name,
        finalSlug,
        normalizedLogoUrl,
        normalizedLogoPublicId,
        normalizedContactEmail,
        normalizedContactPhone,
        normalizedAddress,
        normalizedSocialLinks,
        studioId,
        clearLogo,
      ]
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

    if (clearLogo && existingLogoPublicId) {
      try {
        await cloudinary.uploader.destroy(existingLogoPublicId);
      } catch (error) {
        console.error('Studio logo delete error', error);
      }
    } else if (existingLogoPublicId && normalizedLogoPublicId && existingLogoPublicId !== normalizedLogoPublicId) {
      try {
        await cloudinary.uploader.destroy(existingLogoPublicId);
      } catch (error) {
        console.error('Studio logo delete error', error);
      }
    }

    res.json(studio);
  } catch (err) {
    console.error('Studio update error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/studios/logo/upload-signature:
 *   post:
 *     summary: Get studio logo upload signature
 *     tags: [Studios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Upload signature generated
 *       401:
 *         description: Unauthorized
 */
router.post('/logo/upload-signature', authMiddleware, async (req: any, res) => {
  try {
    if (!req.auth?.studioId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { timestamp, signature, folder, publicId } = await signStudioLogoUploadRequest({
      studioId: req.auth.studioId,
    });

    const cfg = cloudinary.config();
    const cloudName =
      cfg.cloud_name ||
      process.env.CLOUDINARY_CLOUD_NAME ||
      process.env.CLOUDINARY_URL?.split('@')[1];
    const apiKey =
      cfg.api_key ||
      process.env.CLOUDINARY_API_KEY ||
      process.env.CLOUDINARY_URL?.split(':')[1]?.split('@')[0];

    res.json({
      timestamp,
      signature,
      folder,
      publicId,
      cloudName,
      apiKey,
      cloud_name: cloudName,
      api_key: apiKey,
    });
  } catch (error) {
    console.error('Studio logo signature error', error);
    res.status(500).json({ error: 'Failed to generate logo upload signature' });
  }
});

export default router;
