import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../lib/db';
import cloudinary from '../lib/cloudinary';
import { signUploadRequest } from '../lib/cloudinary';
import { syncClientStatsToAdmin, syncClientToAdmin, syncStudioToAdmin } from '../lib/admin-sync';
import { refreshOutboxStatus } from '../lib/outbox';
import { processOutboxUntilEmpty } from '../lib/outbox-processor';
import { asyncHandler } from '../middleware/async-handler';
import { AppError } from '../lib/errors';
import { fail, success } from '../lib/http';

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

export const updateStudioStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body || {};

  if (!id || !status || !ALLOWED_STATUSES.has(status)) {
    throw new AppError('Invalid studio status', 400);
  }

  const result = await pool.query(
    `UPDATE studios
     SET status = $1
     WHERE id = $2
     RETURNING id, name, slug, status, plan, created_at`,
    [status, id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Studio not found', 404);
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

  return success(res, { success: true, studio });
});

export const listStudioOwners = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    throw new AppError('studio id is required', 400);
  }

  const { rows } = await pool.query(
    `SELECT id, email, role, auth_provider, display_name, avatar_url, created_at
     FROM studio_users
     WHERE studio_id = $1 AND role = 'OWNER'
     ORDER BY created_at ASC`,
    [id]
  );

  return success(res, { owners: rows });
});

export const listLegacyClients = asyncHandler(async (_req: Request, res: Response) => {
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

  return success(res, rows);
});

export const createLegacyClient = asyncHandler(async (req: Request, res: Response) => {
  const legacyStudio = await getLegacyStudio();
  const { name, subheading = null, event_date, date } = req.body || {};
  const eventDate = event_date || date;

  if (!name || !eventDate) {
    throw new AppError('Name and event_date are required', 400);
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

  return success(res, client, 201);
});

export const getLegacyClient = asyncHandler(async (req: Request, res: Response) => {
  const legacyStudio = await getLegacyStudio();
  const { id } = req.params;

  const clientResult = await pool.query(
    'SELECT * FROM clients WHERE id = $1 AND studio_id = $2',
    [id, legacyStudio.id]
  );
  if (clientResult.rows.length === 0) {
    throw new AppError('Client not found', 404);
  }

  const photosResult = await pool.query(
    'SELECT id, url, filename, public_id, created_at FROM photos WHERE client_id = $1 ORDER BY created_at DESC LIMIT 500',
    [id]
  );

  return success(res, {
    client: clientResult.rows[0],
    photos: photosResult.rows,
  });
});

export const updateLegacyClient = asyncHandler(async (req: Request, res: Response) => {
  const legacyStudio = await getLegacyStudio();
  const { id } = req.params;
  const body = req.body || {};

  const existing = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
    [id, legacyStudio.id]
  );
  if (existing.rows.length === 0) {
    throw new AppError('Client not found', 404);
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

  return success(res, { success: true });
});

export const deleteLegacyClient = asyncHandler(async (req: Request, res: Response) => {
  const legacyStudio = await getLegacyStudio();
  const { id } = req.params;

  const clientResult = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
    [id, legacyStudio.id]
  );
  if (clientResult.rows.length === 0) {
    throw new AppError('Client not found', 404);
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

  return success(res, { success: true });
});

export const getLegacyUploadSignature = asyncHandler(async (req: Request, res: Response) => {
  const legacyStudio = await getLegacyStudio();
  const { clientId } = req.body || {};

  if (!clientId) {
    throw new AppError('clientId is required', 400);
  }

  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
    [clientId, legacyStudio.id]
  );
  if (clientCheck.rows.length === 0) {
    throw new AppError('Client not found', 404);
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

export const saveLegacyPhotoRecord = asyncHandler(async (req: Request, res: Response) => {
  const legacyStudio = await getLegacyStudio();
  const { clientId, publicId, url, bytes, width, height, format, resourceType, resource_type } = req.body || {};

  if (!clientId || !publicId || !url) {
    throw new AppError('clientId, publicId, and url are required', 400);
  }

  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
    [clientId, legacyStudio.id]
  );
  if (clientCheck.rows.length === 0) {
    throw new AppError('Client not found', 404);
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

  return success(res, { success: true });
});

export const saveLegacyPhotoRecords = asyncHandler(async (req: Request, res: Response) => {
  const legacyStudio = await getLegacyStudio();
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
    [clientId, legacyStudio.id]
  );
  if (clientCheck.rows.length === 0) {
    throw new AppError('Client not found', 404);
  }

  const photoColumns = await getPhotoColumns();
  const publicIds = normalized.map((photo) => photo.publicId);
  const whereClauses = ['client_id = $1', 'public_id = ANY($2::text[])'];
  const params: any[] = [clientId, publicIds];
  if (photoColumns.has('studio_id')) {
    whereClauses.splice(1, 0, 'studio_id = $3');
    params.push(legacyStudio.id);
  }

  const existing = await pool.query(
    `SELECT public_id FROM photos WHERE ${whereClauses.join(' AND ')}`,
    params
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

  const columns = ['id', 'client_id', 'url', 'filename', 'public_id'];
  if (photoColumns.has('studio_id')) columns.splice(2, 0, 'studio_id');
  if (photoColumns.has('size')) columns.push('size');
  if (photoColumns.has('width')) columns.push('width');
  if (photoColumns.has('height')) columns.push('height');
  if (photoColumns.has('format')) columns.push('format');
  if (photoColumns.has('resource_type')) columns.push('resource_type');

  const values: any[] = [];
  const placeholders = toInsert.map((photo, idx) => {
    const row: any[] = [
      randomUUID(),
      clientId,
      photo.url,
      photo.publicId.split('/').pop() || 'uploaded_file',
      photo.publicId,
    ];

    if (photoColumns.has('studio_id')) {
      row.splice(2, 0, legacyStudio.id);
    }
    if (photoColumns.has('size')) row.push(photo.bytes || null);
    if (photoColumns.has('width')) row.push(photo.width || null);
    if (photoColumns.has('height')) row.push(photo.height || null);
    if (photoColumns.has('format')) row.push(photo.format || null);
    if (photoColumns.has('resource_type')) row.push(photo.resourceType || null);

    values.push(...row);
    const base = idx * columns.length;
    const rowPlaceholders = columns.map((_, colIdx) => `$${base + colIdx + 1}`);
    return `(${rowPlaceholders.join(', ')})`;
  });

  await pool.query(
    `INSERT INTO photos (${columns.join(', ')})
     VALUES ${placeholders.join(', ')}`,
    values
  );

  const bytesTotal = toInsert.reduce((sum, photo) => sum + (photo.bytes ? Number(photo.bytes) : 0), 0);
  await syncClientStatsToAdmin({
    studioId: legacyStudio.id,
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

export const deleteLegacyPhoto = asyncHandler(async (req: Request, res: Response) => {
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
    throw new AppError('Photo not found', 404);
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

  return success(res, { success: true });
});

export const processOutbox = asyncHandler(async (_req: Request, res: Response) => {
  const { processed, failed } = await processOutboxUntilEmpty(25);
  return success(res, { success: true, processed, failed });
});

export const processOutboxIfNeeded = asyncHandler(async (_req: Request, res: Response) => {
  await refreshOutboxStatus();
  const statusRes = await pool.query(
    `SELECT status, pending_count, last_degraded_at, last_recovered_at
     FROM sync_outbox_status
     WHERE id = 1`
  );
  const statusRow = statusRes.rows[0] || { status: 'healthy', pending_count: 0 };
  const pendingCount = Number(statusRow.pending_count || 0);

  if (pendingCount === 0) {
    return success(res, {
      success: true,
      skipped: true,
      processed: 0,
      failed: 0,
      pending_count: 0,
      status: statusRow.status,
    });
  }

  const { processed, failed } = await processOutboxUntilEmpty(25);
  await refreshOutboxStatus();
  const refreshed = await pool.query(
    `SELECT status, pending_count, last_degraded_at, last_recovered_at
     FROM sync_outbox_status
     WHERE id = 1`
  );
  const updated = refreshed.rows[0] || statusRow;

  return success(res, {
    success: true,
    skipped: false,
    processed,
    failed,
    pending_count: updated.pending_count,
    status: updated.status,
  });
});

export const getOutboxStatus = asyncHandler(async (_req: Request, res: Response) => {
  const statusRes = await pool.query('SELECT * FROM sync_outbox_status WHERE id = 1');
  if (statusRes.rows.length === 0) {
    await refreshOutboxStatus();
    const refreshed = await pool.query('SELECT * FROM sync_outbox_status WHERE id = 1');
    return success(res, refreshed.rows[0] || { status: 'healthy', pending_count: 0 });
  }

  return success(res, statusRes.rows[0]);
});
