import { Request, Response } from 'express';
import { pool } from '../lib/db';
import { syncStudioToAdmin } from '../lib/admin-sync';

const ALLOWED_STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'DELETED', 'ONBOARDING']);

export async function updateStudioStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!id || !status || !ALLOWED_STATUSES.has(status)) {
      res.status(400).json({ error: 'Invalid studio status' });
      return;
    }

    const result = await pool.query(
      `UPDATE studios
       SET status = $1
       WHERE id = $2
       RETURNING id, name, slug, status, plan, created_at`,
      [status, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Studio not found' });
      return;
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

    res.json({ success: true, studio });
  } catch (error) {
    console.error('Update studio status error:', error);
    res.status(500).json({ error: 'Failed to update studio status' });
  }
}

export async function listStudioOwners(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'studio id is required' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, email, role, auth_provider, display_name, avatar_url, created_at
       FROM studio_users
       WHERE studio_id = $1 AND role = 'OWNER'
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({ owners: rows });
  } catch (error) {
    console.error('List studio owners error:', error);
    res.status(500).json({ error: 'Failed to fetch studio owners' });
  }
}
