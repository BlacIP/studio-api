import type { Response } from 'express';
import type { AuthedRequest } from '../../middleware/auth';
import { fetchAuthUser, updateAuthUserDisplayName } from '../../services/auth/auth-profile';

export async function getMe(req: AuthedRequest, res: Response) {
  const userId = req.auth?.userId;
  const studioId = req.auth?.studioId;
  if (!userId || !studioId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const row = await fetchAuthUser(userId, studioId);

  res.json({
    id: row.id,
    email: row.email,
    name: row.display_name || row.studio_name || row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    permissions: row.permissions,
    studioId: studioId,
    studioSlug: row.studio_slug,
    studioName: row.studio_name,
    studioStatus: row.studio_status,
  });
}

export async function updateMe(req: AuthedRequest, res: Response) {
  const userId = req.auth?.userId;
  const studioId = req.auth?.studioId;
  if (!userId || !studioId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const displayName = req.body?.displayName;
  if (typeof displayName !== 'string') {
    res.status(400).json({ error: 'displayName is required' });
    return;
  }

  const row = await updateAuthUserDisplayName({
    userId,
    studioId,
    displayName,
  });

  res.json({
    user: {
      id: row.id,
      email: row.email,
      name: row.display_name || row.studio_name || row.email,
      role: row.role,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      studioId,
      studioSlug: row.studio_slug,
      studioName: row.studio_name,
      studioStatus: row.studio_status,
    },
  });
}
