import { Response } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../lib/db';
import { AuthedRequest } from '../middleware/auth';
import { signUploadRequest } from '../lib/cloudinary';
import cloudinary from '../lib/cloudinary';
import { syncClientStatsToAdmin } from '../lib/admin-sync';

function canManagePhotos(req: AuthedRequest) {
  const role = req.auth?.role;
  const perms = req.auth?.permissions || [];
  return role === 'OWNER' || role === 'ADMIN' || perms.includes('manage_photos') || perms.includes('upload_photos');
}

export async function getUploadSignature(req: AuthedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?.studioId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!canManagePhotos(req)) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const { clientId } = req.body;
    if (!clientId) {
      res.status(400).json({ error: 'clientId is required' });
      return;
    }

    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
      [clientId, req.auth.studioId]
    );
    if (clientCheck.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const { timestamp, signature, folder } = await signUploadRequest({
      studioId: req.auth.studioId,
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
    console.error('Upload signature error', error);
    res.status(500).json({ error: 'Failed to generate upload signature' });
  }
}

export async function savePhotoRecord(req: AuthedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?.studioId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { clientId, publicId, url, bytes, width, height, format, resourceType, resource_type } = req.body;

    if (!clientId || !publicId || !url) {
      res.status(400).json({ error: 'clientId, publicId, and url are required' });
      return;
    }

    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
      [clientId, req.auth.studioId]
    );
    if (clientCheck.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const filename = publicId.split('/').pop() || 'uploaded_file';
    await pool.query(
      `INSERT INTO photos (id, studio_id, client_id, url, filename, public_id, size, width, height, format, resource_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        randomUUID(),
        req.auth.studioId,
        clientId,
        url,
        filename,
        publicId,
        bytes || null,
        width || null,
        height || null,
        format || null,
        resourceType || resource_type || null,
      ]
    );

    await syncClientStatsToAdmin({
      studioId: req.auth.studioId,
      clientId,
      deltaCount: 1,
      deltaBytes: bytes ? Number(bytes) : 0,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Save photo record error', error);
    res.status(500).json({ error: 'Failed to save photo record' });
  }
}

export async function savePhotoRecords(req: AuthedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?.studioId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!canManagePhotos(req)) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    const { clientId, photos } = req.body || {};
    if (!clientId || !Array.isArray(photos)) {
      res.status(400).json({ error: 'clientId and photos are required' });
      return;
    }

    const maxBatch = Number(process.env.PHOTO_BULK_LIMIT || 20);
    if (photos.length > maxBatch) {
      res.status(413).json({ error: `Too many photos. Max ${maxBatch}` });
      return;
    }

    const seen = new Set<string>();
    const invalid: number[] = [];
    const duplicates: string[] = [];
    const normalized = photos
      .map((photo: any, idx: number) => {
        const publicId = photo?.publicId || photo?.public_id;
        const url = photo?.url;
        if (!publicId || !url) {
          invalid.push(idx);
          return null;
        }
        if (seen.has(publicId)) {
          duplicates.push(publicId);
          return null;
        }
        seen.add(publicId);
        return {
          publicId,
          url,
          bytes: photo?.bytes,
          width: photo?.width,
          height: photo?.height,
          format: photo?.format,
          resourceType: photo?.resourceType || photo?.resource_type,
        };
      })
      .filter(Boolean) as Array<{
        publicId: string;
        url: string;
        bytes?: number;
        width?: number;
        height?: number;
        format?: string;
        resourceType?: string;
      }>;

    if (normalized.length === 0) {
      res.status(400).json({ error: 'No valid photos to save', invalid, duplicates });
      return;
    }

    const clientCheck = await pool.query(
      'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
      [clientId, req.auth.studioId]
    );
    if (clientCheck.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const publicIds = normalized.map((photo) => photo.publicId);
    const existing = await pool.query(
      'SELECT public_id FROM photos WHERE studio_id = $1 AND client_id = $2 AND public_id = ANY($3::text[])',
      [req.auth.studioId, clientId, publicIds]
    );
    const existingSet = new Set(existing.rows.map((row) => row.public_id as string));
    const toInsert = normalized.filter((photo) => !existingSet.has(photo.publicId));

    if (toInsert.length === 0) {
      res.json({
        inserted: 0,
        skipped_existing: existingSet.size,
        skipped_duplicate: duplicates.length,
        invalid,
      });
      return;
    }

    const values: any[] = [];
    const placeholders = toInsert.map((photo, idx) => {
      const base = idx * 11;
      const filename = photo.publicId.split('/').pop() || 'uploaded_file';
      values.push(
        randomUUID(),
        req.auth?.studioId,
        clientId,
        photo.url,
        filename,
        photo.publicId,
        photo.bytes || null,
        photo.width || null,
        photo.height || null,
        photo.format || null,
        photo.resourceType || null
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`;
    });

    await pool.query(
      `INSERT INTO photos (id, studio_id, client_id, url, filename, public_id, size, width, height, format, resource_type)
       VALUES ${placeholders.join(', ')}`,
      values
    );

    const bytesTotal = toInsert.reduce((sum, photo) => sum + (photo.bytes ? Number(photo.bytes) : 0), 0);
    await syncClientStatsToAdmin({
      studioId: req.auth.studioId,
      clientId,
      deltaCount: toInsert.length,
      deltaBytes: bytesTotal,
    });

    res.json({
      inserted: toInsert.length,
      skipped_existing: existingSet.size,
      skipped_duplicate: duplicates.length,
      invalid,
    });
  } catch (error) {
    console.error('Save photo records error', error);
    res.status(500).json({ error: 'Failed to save photo records' });
  }
}

export async function deletePhoto(req: AuthedRequest, res: Response): Promise<void> {
  try {
    if (!req.auth?.studioId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!canManagePhotos(req)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { id } = req.params;
    const photoResult = await pool.query(
      `SELECT p.public_id, p.client_id, p.size
       FROM photos p
       JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1 AND c.studio_id = $2`,
      [id, req.auth.studioId]
    );
    if (photoResult.rows.length === 0) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }

    const { public_id: publicId, client_id: clientId, size } = photoResult.rows[0];
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (cloudinaryError) {
      console.error(`Failed to delete Cloudinary image: ${publicId}`, cloudinaryError);
    }

    await pool.query('DELETE FROM photos WHERE id = $1', [id]);
    await syncClientStatsToAdmin({
      studioId: req.auth.studioId,
      clientId,
      deltaCount: -1,
      deltaBytes: size ? -Number(size) : 0,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete photo error', error);
    res.status(500).json({ error: 'Delete failed' });
  }
}
