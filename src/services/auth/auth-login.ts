import bcrypt from 'bcryptjs';
import { pool } from '../../lib/db';
import { AppError } from '../../lib/errors';
import type { StudioUser } from '../../types';

export type LoginResult = {
  user: StudioUser & {
    studio_slug: string | null;
    studio_name: string | null;
    studio_status: string | null;
  };
};

export async function authenticateStudioUser({
  email,
  password,
  studioSlug,
}: {
  email: string;
  password: string;
  studioSlug?: string;
}): Promise<LoginResult> {
  if (!email || !password) {
    throw new AppError('email and password are required', 400);
  }

  const params: Array<string> = [email];
  let where = 'WHERE u.email = $1';
  if (studioSlug) {
    params.push(studioSlug);
    where += ' AND s.slug = $2';
  }

  const userRes = await pool.query<
    StudioUser & {
      studio_slug: string | null;
      studio_name: string | null;
      studio_status: string | null;
    }
  >(
    `SELECT u.id, u.email, u.password_hash, u.role, u.permissions, u.studio_id, u.auth_provider,
            u.display_name, u.avatar_url,
            s.slug AS studio_slug, s.name AS studio_name, s.status AS studio_status
     FROM studio_users u
     JOIN studios s ON s.id = u.studio_id
     ${where}`,
    params,
  );

  if (userRes.rows.length === 0) {
    throw new AppError('Invalid credentials', studioSlug ? 404 : 401);
  }

  if (!studioSlug && userRes.rows.length > 1) {
    throw new AppError('Multiple studios found. Provide studioSlug.', 409);
  }

  const user = userRes.rows[0];
  if (user.auth_provider && user.auth_provider !== 'local') {
    throw new AppError('Use Google login for this account', 401);
  }
  if (!user.password_hash) {
    throw new AppError('Password not set for this account', 401);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401);
  }

  if (user.studio_status && user.studio_status === 'SUSPENDED') {
    throw new AppError('Studio not active', 403);
  }

  return { user };
}
