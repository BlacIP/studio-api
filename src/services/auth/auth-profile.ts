import { pool } from '../../lib/db';
import { AppError } from '../../lib/errors';
import { syncStudioOwnerToAdmin } from '../../lib/admin-sync';

export async function fetchAuthUser(userId: string, studioId: string) {
  const result = await pool.query(
    `SELECT u.id,
            u.email,
            u.role,
            u.permissions,
            u.display_name,
            u.avatar_url,
            s.slug AS studio_slug,
            s.name AS studio_name,
            s.status AS studio_status
     FROM studio_users u
     JOIN studios s ON s.id = u.studio_id
     WHERE u.id = $1 AND u.studio_id = $2`,
    [userId, studioId],
  );

  if (result.rows.length === 0) {
    throw new AppError('Unauthorized', 401);
  }

  return result.rows[0];
}

export async function updateAuthUserDisplayName({
  userId,
  studioId,
  displayName,
}: {
  userId: string;
  studioId: string;
  displayName: string;
}) {
  const cleanedName = displayName.trim();
  if (!cleanedName) {
    throw new AppError('displayName is required', 400);
  }

  const result = await pool.query(
    `UPDATE studio_users u
     SET display_name = $1
     FROM studios s
     WHERE u.id = $2 AND u.studio_id = $3 AND s.id = u.studio_id
     RETURNING u.id,
               u.email,
               u.role,
               u.auth_provider,
               u.display_name,
               u.avatar_url,
               u.created_at,
               s.slug AS studio_slug,
               s.name AS studio_name,
               s.status AS studio_status`,
    [cleanedName, userId, studioId],
  );

  if (result.rows.length === 0) {
    throw new AppError('Unauthorized', 401);
  }

  const row = result.rows[0];
  await syncStudioOwnerToAdmin({
    studioId,
    ownerId: row.id,
    email: row.email,
    role: row.role,
    authProvider: row.auth_provider,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  });

  return row;
}
