import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../lib/db';
import cloudinary from '../lib/cloudinary';
import { signUploadRequest } from '../lib/cloudinary';
import { syncClientStatsToAdmin, syncClientToAdmin, syncStudioToAdmin } from '../lib/admin-sync';

const ALLOWED_STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'DELETED', 'ONBOARDING']);
const LEGACY_SLUG = process.env.LEGACY_STUDIO_SLUG || 'legacy-studio';
const LEGACY_NAME = process.env.LEGACY_STUDIO_NAME || 'Legacy Studio';
const LEGACY_ID = process.env.LEGACY_STUDIO_ID || null;
let photoColumnsCache: Set<string> | null = null;

async function getLegacyStudio() {
  const result = await pool.query('SELECT id, name, slug FROM studios WHERE slug = $1', [LEGACY_SLUG]);
  if (result.rows.length > 0) {
    return result.rows[0];
  }

  const id = LEGACY_ID || randomUUID();
  const insert = await pool.query(
    `INSERT INTO studios (id, name, slug, status, plan)
     VALUES ($1, $2, $3, 'ACTIVE', 'free')
     RETURNING id, name, slug`,
    [id, LEGACY_NAME, LEGACY_SLUG]
  );

  return insert.rows[0];
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function getPhotoColumns() {
  if (photoColumnsCache) return photoColumnsCache;
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'photos'`
  );
  photoColumnsCache = new Set(result.rows.map((row) => row.column_name));
  return photoColumnsCache;
}

export async function updateStudioStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!id || !status || !ALLOWED_STATUSES.has(status)) {
      res.status(400).json({ error: 'Invalid studio status' });
      return;
    }

    const result = await pool.query(
      `UPDATE studios
       SET status = $1
       WHERE id = $2
       RETURNING id, name, slug, status, plan, created_at`,
      [status, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Studio not found' });
      return;
    }

    const studio = result.rows[0];
    await syncStudioToAdmin({
      id: studio.id,
      name: studio.name,
      slug: studio.slug,
      status: studio.status,
      plan: studio.plan,
      created_at: studio.created_at,
    });

    res.json({ success: true, studio });
  } catch (error) {
    console.error('Update studio status error:', error);
    res.status(500).json({ error: 'Failed to update studio status' });
  }
}

export async function listStudioOwners(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'studio id is required' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, email, role, auth_provider, display_name, avatar_url, created_at
       FROM studio_users
       WHERE studio_id = $1 AND role = 'OWNER'
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({ owners: rows });
  } catch (error) {
    console.error('List studio owners error:', error);
    res.status(500).json({ error: 'Failed to fetch studio owners' });
  }
}

export async function listLegacyClients(req: Request, res: Response): Promise<void> {
  try {
    const legacyStudio = await getLegacyStudio();
    const { rows } = await pool.query(
      `SELECT c.*, COUNT(p.id) as photo_count
       FROM clients c
       LEFT JOIN photos p ON c.id = p.client_id
       WHERE c.studio_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [legacyStudio.id]
    );

    res.json(rows);
  } catch (error) {
    console.error('List legacy clients error', error);
    res.status(500).json({ error: 'Failed to list legacy clients' });
  }
}

export async function createLegacyClient(req: Request, res: Response): Promise<void> {
  try {
    const legacyStudio = await getLegacyStudio();
    const { name, subheading = null, event_date, date } = req.body || {};
    const eventDate = event_date || date;

    if (!name || !eventDate) {
      res.status(400).json({ error: 'Name and event_date are required' });
      return;
    }

    const baseSlug = slugify(name) || `client-${randomUUID().slice(0, 8)}`;
    let slug = baseSlug;
    let suffix = 1;
    while (true) {
      const existing = await pool.query(
        'SELECT id FROM clients WHERE studio_id = $1 AND slug = $2',
        [legacyStudio.id, slug]
      );
      if (existing.rows.length === 0) break;
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const id = randomUUID();
    const insertQuery = `
      INSERT INTO clients (id, studio_id, name, slug, subheading, event_date, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
      RETURNING id, name, slug, subheading, event_date, status, created_at
    `;
    const { rows } = await pool.query(insertQuery, [
      id,
      legacyStudio.id,
      name,
      slug,
      subheading,
      eventDate,
    ]);

    const client = rows[0];
    await syncClientToAdmin({
      studioId: legacyStudio.id,
      clientId: client.id,
      name: client.name,
      slug: client.slug,
      subheading: client.subheading,
      event_date: client.event_date,
      status: client.status,
      created_at: client.created_at,
    });

    res.status(201).json(client);
  } catch (error) {
    console.error('Create legacy client error', error);
    res.status(500).json({ error: 'Failed to create legacy client' });
  }
}

export async function getLegacyClient(req: Request, res: Response): Promise<void> {
  try {
    const legacyStudio = await getLegacyStudio();
    const { id } = req.params;

    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1 AND studio_id = $2',
      [id, legacyStudio.id]
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
  } catch (error) {
    console.error('Get legacy client error', error);
    res.status(500).json({ error: 'Failed to fetch legacy client' });
  }
}

export async function updateLegacyClient(req: Request, res: Response): Promise<void> {
  try {
    const legacyStudio = await getLegacyStudio();
    const { id } = req.params;
    const body = req.body || {};

    const existing = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
      [id, legacyStudio.id]
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
      values.push(id, legacyStudio.id);
      const query = `UPDATE clients SET ${updates.join(', ')}
        WHERE id = $${paramIndex++} AND studio_id = $${paramIndex}
        RETURNING id, studio_id, name, slug, subheading, event_date, status, created_at`;
      const result = await pool.query(query, values);
      updatedClient = result.rows[0] || null;
    } else {
      const result = await pool.query(
        `SELECT id, studio_id, name, slug, subheading, event_date, status, created_at
         FROM clients WHERE id = $1 AND studio_id = $2`,
        [id, legacyStudio.id]
      );
      updatedClient = result.rows[0] || null;
    }

    if (updatedClient) {
      await syncClientToAdmin({
        studioId: legacyStudio.id,
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
  } catch (error) {
    console.error('Update legacy client error', error);
    res.status(500).json({ error: 'Failed to update legacy client' });
  }
}

export async function deleteLegacyClient(req: Request, res: Response): Promise<void> {
  try {
    const legacyStudio = await getLegacyStudio();
    const { id } = req.params;

    const clientResult = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
      [id, legacyStudio.id]
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
        } catch (err) {
          console.error(`Failed to delete Cloudinary image: ${photo.public_id}`, err);
        }
      }
    }

    await pool.query('DELETE FROM photos WHERE client_id = $1', [id]);
    await pool.query('DELETE FROM clients WHERE id = $1', [id]);

    await syncClientToAdmin({
      studioId: legacyStudio.id,
      clientId: id,
      deleted: true,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete legacy client error', error);
    res.status(500).json({ error: 'Failed to delete legacy client' });
  }
}

export async function getLegacyUploadSignature(req: Request, res: Response): Promise<void> {
  try {
    const legacyStudio = await getLegacyStudio();
    const { clientId } = req.body || {};

    if (!clientId) {
      res.status(400).json({ error: 'clientId is required' });
      return;
    }

    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
      [clientId, legacyStudio.id]
    );
    if (clientCheck.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const { timestamp, signature, folder } = await signUploadRequest({
      studioId: legacyStudio.id,
      clientId,
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
      cloudName,
      apiKey,
      cloud_name: cloudName,
      api_key: apiKey,
    });
  } catch (error) {
    console.error('Legacy upload signature error', error);
    res.status(500).json({ error: 'Failed to generate upload signature' });
  }
}

export async function saveLegacyPhotoRecord(req: Request, res: Response): Promise<void> {
  try {
    const legacyStudio = await getLegacyStudio();
    const { clientId, publicId, url, bytes, width, height, format, resourceType, resource_type } = req.body || {};

    if (!clientId || !publicId || !url) {
      res.status(400).json({ error: 'clientId, publicId, and url are required' });
      return;
    }

    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
      [clientId, legacyStudio.id]
    );
    if (clientCheck.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const filename = publicId.split('/').pop() || 'uploaded_file';
    const photoColumns = await getPhotoColumns();
    const columns = ['id', 'client_id', 'url', 'filename', 'public_id'];
    const values: any[] = [randomUUID(), clientId, url, filename, publicId];

    if (photoColumns.has('studio_id')) {
      columns.splice(2, 0, 'studio_id');
      values.splice(2, 0, legacyStudio.id);
    }
    if (photoColumns.has('size')) {
      columns.push('size');
      values.push(bytes || null);
    }
    if (photoColumns.has('width')) {
      columns.push('width');
      values.push(width || null);
    }
    if (photoColumns.has('height')) {
      columns.push('height');
      values.push(height || null);
    }
    if (photoColumns.has('format')) {
      columns.push('format');
      values.push(format || null);
    }
    if (photoColumns.has('resource_type')) {
      columns.push('resource_type');
      values.push(resourceType || resource_type || null);
    }

    const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');

    await pool.query(
      `INSERT INTO photos (${columns.join(', ')})
       VALUES (${placeholders})`,
      values
    );

    await syncClientStatsToAdmin({
      studioId: legacyStudio.id,
      clientId,
      deltaCount: 1,
      deltaBytes: bytes ? Number(bytes) : 0,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Save legacy photo record error', error);
    res.status(500).json({ error: 'Failed to save photo record' });
  }
}

export async function deleteLegacyPhoto(req: Request, res: Response): Promise<void> {
  try {
    const legacyStudio = await getLegacyStudio();
    const { id } = req.params;

    const photoResult = await pool.query(
      `SELECT p.public_id, p.client_id, p.size
       FROM photos p
       JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1 AND c.studio_id = $2`,
      [id, legacyStudio.id]
    );
    if (photoResult.rows.length === 0) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    const { public_id: publicId, client_id: clientId, size } = photoResult.rows[0];
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.error(`Failed to delete Cloudinary image: ${publicId}`, err);
    }

    await pool.query('DELETE FROM photos WHERE id = $1', [id]);
    await syncClientStatsToAdmin({
      studioId: legacyStudio.id,
      clientId,
      deltaCount: -1,
      deltaBytes: size ? -Number(size) : 0,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete legacy photo error', error);
    res.status(500).json({ error: 'Delete failed' });
  }
}
