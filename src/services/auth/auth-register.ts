import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { pool } from '../../lib/db';
import { AppError } from '../../lib/errors';
import { syncStudioOwnerToAdmin, syncStudioToAdmin } from '../../lib/admin-sync';

export type RegisterResult = {
  studio: {
    id: string;
    name: string;
    slug: string;
    status: string;
    plan: string;
    created_at: string;
  };
  owner: {
    id: string;
    email: string;
    role: string;
    auth_provider: string;
    display_name?: string | null;
    avatar_url?: string | null;
    created_at: string;
    permissions: string[];
  };
};

export async function registerStudioOwner({
  email,
  password,
  displayName,
}: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<RegisterResult> {
  if (!email || !password) {
    throw new AppError('email and password are required', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM studio_users WHERE email = $1', [
      email,
    ]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      throw new AppError('Email already registered', 409);
    }

    const studioId = randomUUID();
    const userId = randomUUID();
    const studioName = 'Untitled Studio';
    const studioSlug = `studio-${studioId.slice(0, 8)}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const cleanedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';

    const studioInsert = await client.query(
      `INSERT INTO studios (id, name, slug, status)
       VALUES ($1, $2, $3, 'ONBOARDING')
       RETURNING id, name, slug, status, plan, created_at`,
      [studioId, studioName, studioSlug],
    );

    const userInsert = await client.query(
      `INSERT INTO studio_users (id, email, password_hash, role, permissions, studio_id, auth_provider, display_name)
       VALUES ($1, $2, $3, 'OWNER', $4, $5, 'local', $6)
       RETURNING id, email, role, auth_provider, display_name, avatar_url, created_at`,
      [userId, email, passwordHash, [], studioId, cleanedDisplayName || null],
    );

    await client.query('COMMIT');

    const studioRow = studioInsert.rows[0];
    const ownerRow = userInsert.rows[0];

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
      ownerId: ownerRow.id,
      email: ownerRow.email,
      role: ownerRow.role,
      authProvider: ownerRow.auth_provider,
      displayName: ownerRow.display_name,
      avatarUrl: ownerRow.avatar_url,
      createdAt: ownerRow.created_at,
    });

    return {
      studio: studioRow,
      owner: {
        ...ownerRow,
        permissions: [],
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
