import { randomUUID } from 'crypto';
import { pool } from './db';

export type OutboxEventType =
  | 'studio.sync'
  | 'client.sync'
  | 'client.stats'
  | 'studio.owner.sync';

type OutboxRow = {
  id: string;
  event_type: OutboxEventType;
  payload: unknown;
  attempts: number;
  next_retry_at: string;
};

export async function enqueueOutbox(
  eventType: OutboxEventType,
  payload: unknown,
  lastError?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO sync_outbox (id, event_type, payload, attempts, last_error, next_retry_at)
     VALUES ($1, $2, $3, 0, $4, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [randomUUID(), eventType, JSON.stringify(payload ?? {}), lastError || null]
  );

  await refreshOutboxStatus('degraded');
}

export async function claimOutboxBatch(limit = 25): Promise<OutboxRow[]> {
  const { rows } = await pool.query(
    `WITH cte AS (
       SELECT id
       FROM sync_outbox
       WHERE status = 'pending' AND next_retry_at <= NOW()
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE sync_outbox
     SET status = 'processing', locked_at = NOW(), updated_at = NOW()
     WHERE id IN (SELECT id FROM cte)
     RETURNING id, event_type, payload, attempts, next_retry_at`,
    [limit]
  );

  return rows as OutboxRow[];
}

export async function markOutboxSuccess(id: string): Promise<void> {
  await pool.query('DELETE FROM sync_outbox WHERE id = $1', [id]);
}

export async function markOutboxFailure(id: string, attempts: number, lastError: string): Promise<void> {
  const nextRetrySeconds = getBackoffSeconds(attempts + 1);
  await pool.query(
    `UPDATE sync_outbox
     SET status = 'pending',
         attempts = attempts + 1,
         last_error = $2,
         next_retry_at = NOW() + ($3 || ' seconds')::interval,
         locked_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [id, lastError, `${nextRetrySeconds}`]
  );
}

export async function refreshOutboxStatus(
  overrideStatus?: 'healthy' | 'degraded'
): Promise<void> {
  const pendingRes = await pool.query(
    `SELECT COUNT(*)::int AS pending_count,
            MIN(created_at) AS oldest_pending_at
     FROM sync_outbox
     WHERE status = 'pending'`
  );
  const pendingCount = pendingRes.rows[0]?.pending_count ?? 0;
  const oldestPendingAt = pendingRes.rows[0]?.oldest_pending_at ?? null;

  const errorRes = await pool.query(
    `SELECT last_error
     FROM sync_outbox
     WHERE last_error IS NOT NULL
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  const lastError = errorRes.rows[0]?.last_error ?? null;

  const statusRes = await pool.query('SELECT status FROM sync_outbox_status WHERE id = 1');
  const previousStatus = statusRes.rows[0]?.status ?? 'healthy';
  const status = overrideStatus || (pendingCount > 0 ? 'degraded' : 'healthy');

  const isDegradedTransition = previousStatus !== 'degraded' && status === 'degraded';
  const isRecoveredTransition = previousStatus !== 'healthy' && status === 'healthy';

  await pool.query(
    `INSERT INTO sync_outbox_status
       (id, status, pending_count, oldest_pending_at, last_error, last_degraded_at, last_recovered_at, updated_at)
     VALUES
       (1, $1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       pending_count = EXCLUDED.pending_count,
       oldest_pending_at = EXCLUDED.oldest_pending_at,
       last_error = EXCLUDED.last_error,
       last_degraded_at = COALESCE(EXCLUDED.last_degraded_at, sync_outbox_status.last_degraded_at),
       last_recovered_at = COALESCE(EXCLUDED.last_recovered_at, sync_outbox_status.last_recovered_at),
       updated_at = NOW()`,
    [
      status,
      pendingCount,
      oldestPendingAt,
      lastError,
      isDegradedTransition ? new Date() : null,
      isRecoveredTransition ? new Date() : null,
    ]
  );
}

function getBackoffSeconds(attempt: number): number {
  if (attempt <= 1) return 15;
  if (attempt === 2) return 60;
  if (attempt === 3) return 5 * 60;
  if (attempt === 4) return 15 * 60;
  if (attempt === 5) return 60 * 60;
  return 6 * 60 * 60;
}
