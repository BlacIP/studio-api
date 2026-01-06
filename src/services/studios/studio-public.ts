import { pool } from '../../lib/db';
import { AppError } from '../../lib/errors';

export async function getPublicStudioProfile(slug: string) {
  const result = await pool.query(
    `SELECT name,
            slug,
            status,
            logo_url,
            contact_email,
            contact_phone,
            address,
            social_links
     FROM studios
     WHERE slug = $1`,
    [slug]
  );

  if (result.rows.length === 0 || result.rows[0].status !== 'ACTIVE') {
    throw new AppError('Studio not found', 404);
  }

  return result.rows[0];
}

export async function getPublicStudioClients(slug: string) {
  const studioResult = await pool.query('SELECT id FROM studios WHERE slug = $1 AND status = $2', [
    slug,
    'ACTIVE',
  ]);
  if (studioResult.rows.length === 0) {
    throw new AppError('Studio not found', 404);
  }

  const studioId = studioResult.rows[0].id;
  const result = await pool.query(
    `SELECT c.id,
            c.name,
            c.slug,
            c.event_date,
            c.status,
            c.subheading,
            c.header_media_url,
            c.header_media_type,
            COUNT(p.id)::int AS photo_count
     FROM clients c
     LEFT JOIN photos p ON p.client_id = c.id
     WHERE c.studio_id = $1
       AND c.status = 'ACTIVE'
     GROUP BY c.id
     ORDER BY c.event_date DESC NULLS LAST, c.created_at DESC`,
    [studioId]
  );

  return result.rows;
}
