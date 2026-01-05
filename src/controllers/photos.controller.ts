import { Response } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../lib/db';
import { AuthedRequest } from '../middleware/auth';
import { signUploadRequest } from '../lib/cloudinary';
import cloudinary from '../lib/cloudinary';
import { syncClientStatsToAdmin } from '../lib/admin-sync';
import { asyncHandler } from '../middleware/async-handler';
import { AppError } from '../lib/errors';
import { fail, success } from '../lib/http';

function canManagePhotos(req: AuthedRequest) {
  const role = req.auth?.role;
  const perms = req.auth?.permissions || [];
  return role === 'OWNER' || role === 'ADMIN' || perms.includes('manage_photos') || perms.includes('upload_photos');
}

export const getUploadSignature = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.auth?.studioId) {
    throw new AppError('Unauthorized', 401);
  }

  if (!canManagePhotos(req)) {
    throw new AppError('Permission denied', 403);
  }

  const { clientId } = req.body || {};
  if (!clientId) {
    throw new AppError('clientId is required', 400);
  }

  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
    [clientId, req.auth.studioId]
  );
  if (clientCheck.rows.length === 0) {
    throw new AppError('Client not found', 404);
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

  return success(res, {
    timestamp,
    signature,
    folder,
    cloudName,
    apiKey,
    cloud_name: cloudName,
    api_key: apiKey,
  });
});

export const savePhotoRecord = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.auth?.studioId) {
    throw new AppError('Unauthorized', 401);
  }

  const { clientId, publicId, url, bytes, width, height, format, resourceType, resource_type } = req.body || {};

  if (!clientId || !publicId || !url) {
    throw new AppError('clientId, publicId, and url are required', 400);
  }

  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
    [clientId, req.auth.studioId]
  );
  if (clientCheck.rows.length === 0) {
    throw new AppError('Client not found', 404);
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

  return success(res, { success: true });
});

export const savePhotoRecords = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.auth?.studioId) {
    throw new AppError('Unauthorized', 401);
  }

  if (!canManagePhotos(req)) {
    throw new AppError('Permission denied', 403);
  }

  const { clientId, photos } = req.body || {};
  if (!clientId || !Array.isArray(photos)) {
    throw new AppError('clientId and photos are required', 400);
  }

  const maxBatch = Number(process.env.PHOTO_BULK_LIMIT || 20);
  if (photos.length > maxBatch) {
    throw new AppError(`Too many photos. Max ${maxBatch}`, 413);
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
    return fail(res, 'No valid photos to save', 400, { invalid, duplicates });
  }

  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
    [clientId, req.auth.studioId]
  );
  if (clientCheck.rows.length === 0) {
    throw new AppError('Client not found', 404);
  }

  const publicIds = normalized.map((photo) => photo.publicId);
  const existing = await pool.query(
    'SELECT public_id FROM photos WHERE studio_id = $1 AND client_id = $2 AND public_id = ANY($3::text[])',
    [req.auth.studioId, clientId, publicIds]
  );
  const existingSet = new Set(existing.rows.map((row) => row.public_id as string));
  const toInsert = normalized.filter((photo) => !existingSet.has(photo.publicId));

  if (toInsert.length === 0) {
    return success(res, {
      inserted: 0,
      skipped_existing: existingSet.size,
      skipped_duplicate: duplicates.length,
      invalid,
    });
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

  return success(res, {
    inserted: toInsert.length,
    skipped_existing: existingSet.size,
    skipped_duplicate: duplicates.length,
    invalid,
  });
});

export const deletePhoto = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.auth?.studioId) {
    throw new AppError('Unauthorized', 401);
  }

  if (!canManagePhotos(req)) {
    throw new AppError('Forbidden', 403);
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
    throw new AppError('Photo not found', 404);
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

  return success(res, { success: true });
});
