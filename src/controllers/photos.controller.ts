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
      `INSERT INTO photos (id, client_id, url, filename, public_id, size, width, height, format, resource_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        randomUUID(),
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
