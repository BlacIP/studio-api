import { pool } from '../../lib/db';
import { AppError } from '../../lib/errors';
import { getLegacyStudio } from './legacy-studio';

export async function listLegacyClients() {
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

  return rows;
}

export async function getLegacyClient(id: string) {
  const legacyStudio = await getLegacyStudio();
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

  return {
    client: clientResult.rows[0],
    photos: photosResult.rows,
  };
}
