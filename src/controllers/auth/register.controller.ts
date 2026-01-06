import type { Request, Response } from 'express';
import { signToken } from '../../lib/auth';
import { registerStudioOwner } from '../../services/auth/auth-register';
import { setStudioAuthCookie } from './utils';

export async function registerStudio(req: Request, res: Response) {
  const { email, password, displayName } = req.body || {};

  const { studio, owner } = await registerStudioOwner({
    email,
    password,
    displayName,
  });

  const token = signToken({
    userId: owner.id,
    studioId: studio.id,
    role: owner.role,
    permissions: owner.permissions,
  });

  setStudioAuthCookie(res, token);

  res.status(201).json({
    token,
    user: {
      id: owner.id,
      email: owner.email,
      role: owner.role,
      permissions: owner.permissions,
      studioId: studio.id,
      studioSlug: studio.slug,
      studioName: studio.name,
      studioStatus: studio.status,
      displayName: owner.display_name,
      avatarUrl: owner.avatar_url,
    },
  });
}
