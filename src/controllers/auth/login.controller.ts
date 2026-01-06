import type { Request, Response } from 'express';
import { signToken } from '../../lib/auth';
import { authenticateStudioUser } from '../../services/auth/auth-login';
import { setStudioAuthCookie } from './utils';

export async function loginStudio(req: Request, res: Response) {
  const { email, password, studioSlug } = req.body || {};

  const { user } = await authenticateStudioUser({ email, password, studioSlug });

  const token = signToken({
    userId: user.id,
    studioId: user.studio_id,
    role: user.role,
    permissions: user.permissions || undefined,
  });

  setStudioAuthCookie(res, token);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      studioId: user.studio_id,
      studioSlug: user.studio_slug,
      studioName: user.studio_name,
      studioStatus: user.studio_status,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
    },
  });
}
