import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware, requireStudio, AuthedRequest } from '../middleware/auth';
import { pool } from '../lib/db';

const router = Router();

// List clients for the authenticated studio
router.get('/', authMiddleware, requireStudio, async (req: AuthedRequest, res) => {
  try {
    const studioId = req.auth!.studioId;
    const result = await pool.query(
      `SELECT id, name, event_date, status, slug, created_at 
       FROM clients 
       WHERE studio_id = $1
       ORDER BY created_at DESC`,
      [studioId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List clients error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create client for the authenticated studio
router.post('/', authMiddleware, requireStudio, async (req: AuthedRequest, res) => {
  try {
    const studioId = req.auth!.studioId;
    const { name, event_date, subheading } = req.body;
    if (!name || !event_date) {
      res.status(400).json({ error: 'Name and event_date are required' });
      return;
    }

    const slug = name.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    const id = randomUUID();
    const insertQuery = `
      INSERT INTO clients (id, studio_id, name, slug, subheading, event_date, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
      RETURNING id, name, slug, subheading, event_date, status
    `;
    const { rows } = await pool.query(insertQuery, [id, studioId, name, slug, subheading || null, event_date]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create client error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
