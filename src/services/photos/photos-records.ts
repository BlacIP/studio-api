import { randomUUID } from 'crypto';
import { pool } from '../../lib/db';
import { syncClientStatsToAdmin } from '../../lib/admin-sync';
import { AppError } from '../../lib/errors';
import { ensureClientExists, normalizePhotoBatch, type PhotoInput } from './photos-helpers';

type PhotoBatchResult = {
  inserted: number;
  skipped_existing: number;
  skipped_duplicate: number;
  invalid: number[];
  duplicates: string[];
  empty?: boolean;
};

export async function savePhotoRecord({
  studioId,
  clientId,
  publicId,
  url,
  filename,
  bytes,
  width,
  height,
  format,
  resourceType,
}: {
  studioId: string;
  clientId: string;
  publicId: string;
  url: string;
  filename?: string;
  bytes?: number;
  width?: number;
  height?: number;
  format?: string;
  resourceType?: string | null;
}) {
  await ensureClientExists(studioId, clientId);

  const resolvedFilename = resolveFilename(filename, publicId);
  await pool.query(
    `INSERT INTO photos (id, studio_id, client_id, url, filename, public_id, size, width, height, format, resource_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      randomUUID(),
      studioId,
      clientId,
      url,
      resolvedFilename,
      publicId,
      bytes || null,
      width || null,
      height || null,
      format || null,
      resourceType || null,
    ]
  );

  await syncClientStatsToAdmin({
    studioId,
    clientId,
    deltaCount: 1,
    deltaBytes: bytes ? Number(bytes) : 0,
  });

  return { success: true };
}

export async function savePhotoRecords({
  studioId,
  clientId,
  photos,
}: {
  studioId: string;
  clientId: string;
  photos: PhotoInput[];
}): Promise<PhotoBatchResult> {
  const maxBatch = Number(process.env.PHOTO_BULK_LIMIT || 20);
  if (photos.length > maxBatch) {
    throw new AppError(`Too many photos. Max ${maxBatch}`, 413);
  }

  const { normalized, invalid, duplicates } = normalizePhotoBatch(photos);
  if (!normalized.length) {
    return {
      inserted: 0,
      skipped_existing: 0,
      skipped_duplicate: duplicates.length,
      invalid,
      duplicates,
      empty: true,
    };
  }

  await ensureClientExists(studioId, clientId);

  const publicIds = normalized.map((photo) => photo.publicId);
  const existing = await pool.query(
    'SELECT public_id FROM photos WHERE studio_id = $1 AND client_id = $2 AND public_id = ANY($3::text[])',
    [studioId, clientId, publicIds]
  );
  const existingSet = new Set(existing.rows.map((row) => row.public_id as string));
  const toInsert = normalized.filter((photo) => !existingSet.has(photo.publicId));

  if (!toInsert.length) {
    return {
      inserted: 0,
      skipped_existing: existingSet.size,
      skipped_duplicate: duplicates.length,
      invalid,
      duplicates,
    };
  }

  const values: Array<string | number | null> = [];
  const placeholders = toInsert.map((photo, idx) => {
    const base = idx * 11;
    const resolvedFilename = resolveFilename(photo.filename, photo.publicId);
    values.push(
      randomUUID(),
      studioId,
      clientId,
      photo.url,
      resolvedFilename,
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
    studioId,
    clientId,
    deltaCount: toInsert.length,
    deltaBytes: bytesTotal,
  });

  return {
    inserted: toInsert.length,
    skipped_existing: existingSet.size,
    skipped_duplicate: duplicates.length,
    invalid,
    duplicates,
  };
}

function resolveFilename(filename: string | undefined, publicId: string) {
  const trimmed = filename?.trim();
  if (trimmed) return trimmed;
  return publicId.split('/').pop() || 'uploaded_file';
}
