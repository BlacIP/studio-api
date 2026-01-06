import { pool } from '../../lib/db';
import { syncStudioToAdmin } from '../../lib/admin-sync';
import { AppError } from '../../lib/errors';

const ALLOWED_STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'DELETED', 'ONBOARDING']);

export async function updateStudioStatus(id: string, status: string) {
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

  return { success: true, studio };
}

export async function listStudioOwners(id: string) {
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

  return { owners: rows };
}
