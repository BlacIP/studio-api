import type { Request, Response } from 'express';
import { pool } from './db';
import { refreshOutboxStatus } from './outbox';

export async function healthHandler(_req: Request, res: Response) {
  const payload: {
    status: 'ok';
    timestamp: string;
    outbox?: {
      status: string;
      pending_count?: number;
      last_degraded_at?: string | null;
      last_recovered_at?: string | null;
    };
  } = { status: 'ok', timestamp: new Date().toISOString() };

  try {
    await refreshOutboxStatus();
    const statusRes = await pool.query(
      `SELECT status, pending_count, last_degraded_at, last_recovered_at
       FROM sync_outbox_status
       WHERE id = 1`
    );
    if (statusRes.rows.length > 0) {
      const row = statusRes.rows[0];
      payload.outbox = {
        status: row.status,
        pending_count: row.pending_count,
        last_degraded_at: row.last_degraded_at,
        last_recovered_at: row.last_recovered_at,
      };
    } else {
      payload.outbox = { status: 'unknown' };
    }
  } catch (error) {
    payload.outbox = { status: 'unknown' };
    console.error('Health outbox status error', error);
  }

  res.json(payload);
}
