import { randomUUID } from 'crypto';
import { pool } from '../../lib/db';
import { syncStudioOwnerToAdmin, syncStudioToAdmin } from '../../lib/admin-sync';
import type { StudioUser } from '../../types';
import { AppError } from '../../lib/errors';

export type GoogleUserResult = {
  userId: string;
  studioId: string;
  studioSlug: string;
  studioName: string;
  studioStatus: string;
  role: string;
  permissions: string[];
};

export async function upsertGoogleUser({
  providerId,
  email,
  displayName,
  avatarUrl,
}: {
  providerId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}): Promise<GoogleUserResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const providerRes = await client.query<
      StudioUser & {
        studio_slug: string | null;
        studio_name: string | null;
        studio_status: string | null;
      }
    >(
      `SELECT u.id, u.email, u.role, u.permissions, u.studio_id, u.auth_provider, u.provider_id,
              s.slug AS studio_slug, s.name AS studio_name, s.status AS studio_status
       FROM studio_users u
       JOIN studios s ON s.id = u.studio_id
       WHERE u.auth_provider = 'google' AND u.provider_id = $1`,
      [providerId],
    );

    let userId: string;
    let studioId: string;
    let studioSlug: string;
    let studioName: string;
    let studioStatus: string;
    let role: string;
    let permissions: string[] = [];

    if (providerRes.rows.length > 0) {
      const row = providerRes.rows[0];
      userId = row.id;
      studioId = row.studio_id;
      studioSlug = row.studio_slug || '';
      studioName = row.studio_name || '';
      studioStatus = row.studio_status || 'ONBOARDING';
      role = row.role;
      permissions = row.permissions || [];

      await client.query(
        `UPDATE studio_users
         SET email = $1, display_name = $2, avatar_url = $3
         WHERE id = $4`,
        [email, displayName || null, avatarUrl || null, userId],
      );
    } else {
      const emailRes = await client.query<
        StudioUser & {
          studio_slug: string | null;
          studio_name: string | null;
          studio_status: string | null;
        }
      >(
        `SELECT u.id, u.email, u.role, u.permissions, u.studio_id, u.auth_provider, u.provider_id,
                s.slug AS studio_slug, s.name AS studio_name, s.status AS studio_status
         FROM studio_users u
         JOIN studios s ON s.id = u.studio_id
         WHERE u.email = $1`,
        [email],
      );

      if (emailRes.rows.length > 0) {
        const row = emailRes.rows[0];
        if (row.auth_provider !== 'google') {
          await client.query('ROLLBACK');
          throw new AppError('use_password', 409);
        }

        userId = row.id;
        studioId = row.studio_id;
        studioSlug = row.studio_slug || '';
        studioName = row.studio_name || '';
        studioStatus = row.studio_status || 'ONBOARDING';
        role = row.role;
        permissions = row.permissions || [];

        await client.query(
          `UPDATE studio_users
           SET provider_id = $1, display_name = $2, avatar_url = $3
           WHERE id = $4`,
          [providerId, displayName || null, avatarUrl || null, userId],
        );
      } else {
        const studioIdNew = randomUUID();
        const userIdNew = randomUUID();
        const studioNameNew = 'Untitled Studio';
        const studioSlugNew = `studio-${studioIdNew.slice(0, 8)}`;

        const studioInsert = await client.query(
          `INSERT INTO studios (id, name, slug, status)
           VALUES ($1, $2, $3, 'ONBOARDING')
           RETURNING id, name, slug, status, plan, created_at`,
          [studioIdNew, studioNameNew, studioSlugNew],
        );

        await client.query(
          `INSERT INTO studio_users (id, email, role, permissions, studio_id, auth_provider, provider_id, display_name, avatar_url)
           VALUES ($1, $2, 'OWNER', $3, $4, 'google', $5, $6, $7)`,
          [userIdNew, email, [], studioIdNew, providerId, displayName || null, avatarUrl || null],
        );

        const studioRow = studioInsert.rows[0];
        userId = userIdNew;
        studioId = studioRow.id;
        studioSlug = studioRow.slug;
        studioName = studioRow.name;
        studioStatus = studioRow.status;
        role = 'OWNER';
        permissions = [];

        await syncStudioToAdmin({
          id: studioRow.id,
          name: studioRow.name,
          slug: studioRow.slug,
          status: studioRow.status,
          plan: studioRow.plan,
          created_at: studioRow.created_at,
        });

        await syncStudioOwnerToAdmin({
          studioId: studioRow.id,
          ownerId: userIdNew,
          email,
          role: 'OWNER',
          authProvider: 'google',
          displayName: displayName || null,
          avatarUrl: avatarUrl || null,
          createdAt: studioRow.created_at,
        });
      }
    }

    await client.query('COMMIT');

    return {
      userId,
      studioId,
      studioSlug,
      studioName,
      studioStatus,
      role,
      permissions,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
