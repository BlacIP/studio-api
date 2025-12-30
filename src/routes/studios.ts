import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../lib/db';

const router = Router();

// Return the current studio info for the logged-in user
router.get('/me', authMiddleware, async (req: any, res) => {
  try {
    const studioId = req.auth?.studioId;
    if (!studioId) {
      res.status(403).json({ error: 'Studio scope required' });
      return;
    }
    const result = await pool.query('SELECT id, name, slug, status FROM studios WHERE id = $1', [studioId]);
    const studio = result.rows[0];
    if (!studio) {
      res.status(404).json({ error: 'Studio not found' });
      return;
    }
    res.json(studio);
  } catch (err) {
    console.error('Studio me error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
