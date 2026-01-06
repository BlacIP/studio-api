import { randomUUID } from 'crypto';
import { pool } from '../../lib/db';

const LEGACY_SLUG = process.env.LEGACY_STUDIO_SLUG || 'legacy-studio';
const LEGACY_NAME = process.env.LEGACY_STUDIO_NAME || 'Legacy Studio';
const LEGACY_ID = process.env.LEGACY_STUDIO_ID || null;

let photoColumnsCache: Set<string> | null = null;

export async function getLegacyStudio() {
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

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export async function getPhotoColumns() {
  if (photoColumnsCache) return photoColumnsCache;
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'photos'`
  );
  photoColumnsCache = new Set(result.rows.map((row) => row.column_name));
  return photoColumnsCache;
}
