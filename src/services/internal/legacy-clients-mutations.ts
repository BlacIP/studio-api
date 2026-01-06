import { randomUUID } from 'crypto';
import { pool } from '../../lib/db';
import cloudinary from '../../lib/cloudinary';
import { syncClientToAdmin } from '../../lib/admin-sync';
import { AppError } from '../../lib/errors';
import { getLegacyStudio, slugify } from './legacy-studio';

type LegacyClientUpdateInput = {
  header_media_url?: string | null;
  header_media_type?: string | null;
  status?: string;
  name?: string;
  subheading?: string | null;
  event_date?: string | null;
};

export async function createLegacyClient({
  name,
  subheading,
  eventDate,
}: {
  name: string;
  subheading?: string | null;
  eventDate: string;
}) {
  const legacyStudio = await getLegacyStudio();
  const baseSlug = slugify(name) || `client-${randomUUID().slice(0, 8)}`;
  let slug = baseSlug;
  let suffix = 1;
  let existing = await pool.query(
    'SELECT id FROM clients WHERE studio_id = $1 AND slug = $2',
    [legacyStudio.id, slug]
  );
  while (existing.rows.length > 0) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
    existing = await pool.query(
      'SELECT id FROM clients WHERE studio_id = $1 AND slug = $2',
      [legacyStudio.id, slug]
    );
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
    subheading || null,
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

  return client;
}

export async function updateLegacyClient(id: string, body: LegacyClientUpdateInput) {
  const legacyStudio = await getLegacyStudio();

  const existing = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
    [id, legacyStudio.id]
  );
  if (existing.rows.length === 0) {
    throw new AppError('Client not found', 404);
  }

  const updates: string[] = [];
  const values: Array<string | number | null> = [];
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

  return { success: true };
}

export async function deleteLegacyClient(id: string) {
  const legacyStudio = await getLegacyStudio();
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

  return { success: true };
}
