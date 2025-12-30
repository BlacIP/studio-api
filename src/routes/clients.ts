import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware, requireStudio, AuthedRequest } from '../middleware/auth';
import { pool } from '../lib/db';
import cloudinary from '../lib/cloudinary';
import { syncClientToAdmin } from '../lib/admin-sync';

const router = Router();

function canManageClients(req: AuthedRequest) {
  const role = req.auth?.role;
  const perms = req.auth?.permissions || [];
  return role === 'OWNER' || role === 'ADMIN' || perms.includes('manage_clients');
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * @openapi
 * /api/clients:
 *   get:
 *     summary: List studio clients
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of clients
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Client'
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
 */
router.get('/', authMiddleware, requireStudio, async (req: AuthedRequest, res) => {
  try {
    const studioId = req.auth!.studioId;
    const { rows } = await pool.query(
      `SELECT c.*, COUNT(p.id) as photo_count
       FROM clients c
       LEFT JOIN photos p ON c.id = p.client_id
       WHERE c.studio_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [studioId]
    );

    res.json(rows);
  } catch (err) {
    console.error('List clients error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/clients:
 *   post:
 *     summary: Create a client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClientCreateRequest'
 *     responses:
 *       201:
 *         description: Client created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Client'
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
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', authMiddleware, requireStudio, async (req: AuthedRequest, res) => {
  try {
    if (!canManageClients(req)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const studioId = req.auth!.studioId;
    const { name, subheading = null, event_date, date } = req.body;
    const eventDate = event_date || date;
    if (!name || !eventDate) {
      res.status(400).json({ error: 'Name and event_date are required' });
      return;
    }

    const slug = slugify(name);
    const id = randomUUID();
    const insertQuery = `
      INSERT INTO clients (id, studio_id, name, slug, subheading, event_date, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
      RETURNING id, name, slug, subheading, event_date, status, created_at
    `;
    const { rows } = await pool.query(insertQuery, [id, studioId, name, slug, subheading, eventDate]);
    const client = rows[0];
    await syncClientToAdmin({
      studioId,
      clientId: client.id,
      name: client.name,
      slug: client.slug,
      subheading: client.subheading,
      event_date: client.event_date,
      status: client.status,
      created_at: client.created_at,
    });
    res.status(201).json(client);
  } catch (err) {
    console.error('Create client error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/clients/{id}:
 *   get:
 *     summary: Get client by ID
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Client details with photos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 client:
 *                   $ref: '#/components/schemas/Client'
 *                 photos:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Photo'
 *       404:
 *         description: Client not found
 */
router.get('/:id', authMiddleware, requireStudio, async (req: AuthedRequest, res) => {
  try {
    const studioId = req.auth!.studioId;
    const { id } = req.params;

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1 AND studio_id = $2',
      [id, studioId]
    );
    if (clientResult.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const photosResult = await pool.query(
      'SELECT id, url, filename, public_id, created_at FROM photos WHERE client_id = $1 ORDER BY created_at DESC LIMIT 500',
      [id]
    );

    res.json({
      client: clientResult.rows[0],
      photos: photosResult.rows,
    });
  } catch (err) {
    console.error('Get client error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/clients/{id}:
 *   put:
 *     summary: Update client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClientUpdateRequest'
 *     responses:
 *       200:
 *         description: Client updated
 *       403:
 *         description: Forbidden
 */
router.put('/:id', authMiddleware, requireStudio, async (req: AuthedRequest, res) => {
  try {
    if (!canManageClients(req)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const studioId = req.auth!.studioId;
    const { id } = req.params;
    const body = req.body || {};

    const existing = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
      [id, studioId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (body.header_media_url !== undefined) {
      updates.push(`header_media_url = $${paramIndex++}`);
      values.push(body.header_media_url);
    }
    if (body.header_media_type !== undefined) {
      updates.push(`header_media_type = $${paramIndex++}`);
      values.push(body.header_media_type);
    }
    if (body.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(body.status);
      updates.push('status_updated_at = NOW()');
    }
    if (body.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(body.name);
      const slug = slugify(body.name);
      updates.push(`slug = $${paramIndex++}`);
      values.push(slug);
    }
    if (body.subheading !== undefined) {
      updates.push(`subheading = $${paramIndex++}`);
      values.push(body.subheading);
    }
    if (body.event_date !== undefined) {
      updates.push(`event_date = $${paramIndex++}`);
      values.push(body.event_date);
    }

    let updatedClient = null;
    if (updates.length > 0) {
      values.push(id, studioId);
      const query = `UPDATE clients SET ${updates.join(', ')}
        WHERE id = $${paramIndex++} AND studio_id = $${paramIndex}
        RETURNING id, studio_id, name, slug, subheading, event_date, status, created_at`;
      const result = await pool.query(query, values);
      updatedClient = result.rows[0] || null;
    } else {
      const result = await pool.query(
        `SELECT id, studio_id, name, slug, subheading, event_date, status, created_at
         FROM clients WHERE id = $1 AND studio_id = $2`,
        [id, studioId]
      );
      updatedClient = result.rows[0] || null;
    }

    if (updatedClient) {
      await syncClientToAdmin({
        studioId,
        clientId: updatedClient.id,
        name: updatedClient.name,
        slug: updatedClient.slug,
        subheading: updatedClient.subheading,
        event_date: updatedClient.event_date,
        status: updatedClient.status,
        created_at: updatedClient.created_at,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Update client error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @openapi
 * /api/clients/{id}:
 *   delete:
 *     summary: Delete client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Client deleted
 *       403:
 *         description: Forbidden
 */
router.delete('/:id', authMiddleware, requireStudio, async (req: AuthedRequest, res) => {
  try {
    if (!canManageClients(req)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const studioId = req.auth!.studioId;
    const { id } = req.params;

    const clientResult = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
      [id, studioId]
    );
    if (clientResult.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const photosResult = await pool.query('SELECT public_id FROM photos WHERE client_id = $1', [id]);
    if (photosResult.rows.length > 0) {
      for (const photo of photosResult.rows) {
        try {
          await cloudinary.uploader.destroy(photo.public_id);
        } catch (e) {
          console.error(`Failed to delete Cloudinary image: ${photo.public_id}`, e);
        }
      }
    }

    await pool.query('DELETE FROM photos WHERE client_id = $1', [id]);
    await pool.query('DELETE FROM clients WHERE id = $1', [id]);

    await syncClientToAdmin({
      studioId,
      clientId: id,
      deleted: true,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete client error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
