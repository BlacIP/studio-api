import { randomUUID } from 'crypto';
import { pool } from '../../lib/db';
import { syncClientStatsToAdmin } from '../../lib/admin-sync';
import { AppError } from '../../lib/errors';
import { getLegacyStudio, getPhotoColumns } from './legacy-studio';

export async function saveLegacyPhotoRecord({
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
  const legacyStudio = await getLegacyStudio();

  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
    [clientId, legacyStudio.id]
  );
  if (clientCheck.rows.length === 0) {
    throw new AppError('Client not found', 404);
  }

  const resolvedFilename = resolveFilename(filename, publicId);
  const photoColumns = await getPhotoColumns();
  const columns = ['id', 'client_id', 'url', 'filename', 'public_id'];
  const values: Array<string | number | null> = [randomUUID(), clientId, url, resolvedFilename, publicId];

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
    values.push(resourceType || null);
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

  return { success: true };
}

function resolveFilename(filename: string | undefined, publicId: string) {
  const trimmed = filename?.trim();
  if (trimmed) return trimmed;
  return publicId.split('/').pop() || 'uploaded_file';
}
