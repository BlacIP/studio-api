import { randomUUID } from 'crypto';
import { pool } from '../../lib/db';
import { syncClientStatsToAdmin } from '../../lib/admin-sync';
import { AppError } from '../../lib/errors';
import { getLegacyStudio, getPhotoColumns } from './legacy-studio';

type LegacyBatchResult = {
  inserted: number;
  skipped_existing: number;
  skipped_duplicate: number;
  invalid: number[];
  duplicates: string[];
  empty?: boolean;
};

type LegacyPhotoInput = {
  publicId?: string;
  public_id?: string;
  url?: string;
  filename?: string;
  bytes?: number;
  width?: number;
  height?: number;
  format?: string;
  resourceType?: string;
  resource_type?: string;
};

export async function saveLegacyPhotoRecords({
  clientId,
  photos,
}: {
  clientId: string;
  photos: LegacyPhotoInput[];
}): Promise<LegacyBatchResult> {
  const legacyStudio = await getLegacyStudio();
  const maxBatch = Number(process.env.PHOTO_BULK_LIMIT || 20);
  if (photos.length > maxBatch) {
    throw new AppError(`Too many photos. Max ${maxBatch}`, 413);
  }

  const seen = new Set<string>();
  const invalid: number[] = [];
  const duplicates: string[] = [];
  const normalized = photos
    .map((photo, idx: number) => {
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
        filename: photo?.filename,
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
    filename?: string;
    bytes?: number;
    width?: number;
    height?: number;
    format?: string;
    resourceType?: string;
  }>;

  if (normalized.length === 0) {
    return {
      inserted: 0,
      skipped_existing: 0,
      skipped_duplicate: duplicates.length,
      invalid,
      duplicates,
      empty: true,
    };
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
  const params: Array<string | string[]> = [clientId, publicIds];
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
    return {
      inserted: 0,
      skipped_existing: existingSet.size,
      skipped_duplicate: duplicates.length,
      invalid,
      duplicates,
    };
  }

  const columns = ['id', 'client_id', 'url', 'filename', 'public_id'];
  if (photoColumns.has('studio_id')) columns.splice(2, 0, 'studio_id');
  if (photoColumns.has('size')) columns.push('size');
  if (photoColumns.has('width')) columns.push('width');
  if (photoColumns.has('height')) columns.push('height');
  if (photoColumns.has('format')) columns.push('format');
  if (photoColumns.has('resource_type')) columns.push('resource_type');

  const values: Array<string | number | null> = [];
  const placeholders = toInsert.map((photo, idx) => {
    const filename = resolveFilename(photo.filename, photo.publicId);
    const row: Array<string | number | null> = [
      randomUUID(),
      clientId,
      photo.url,
      filename,
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
