const { Pool } = require('@neondatabase/serverless');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
dotenv.config();

const studioDbUrl = process.env.STUDIO_DATABASE_URL || process.env.DATABASE_URL;
const adminSyncUrl = process.env.ADMIN_SYNC_URL;
const adminSyncSecret = process.env.ADMIN_SYNC_SECRET;

if (!studioDbUrl) {
  console.error('Missing STUDIO_DATABASE_URL or DATABASE_URL (studio DB connection string).');
  process.exit(1);
}

if (!adminSyncUrl || !adminSyncSecret) {
  console.error('Missing ADMIN_SYNC_URL or ADMIN_SYNC_SECRET (admin sync config).');
  process.exit(1);
}

const EVENT_PATHS = {
  'studio.sync': '/studios/sync',
  'client.sync': '/clients/sync',
  'client.stats': '/clients/stats',
  'studio.owner.sync': '/studios/owners/sync',
};

async function postAdmin(path, payload) {
  const baseUrl = adminSyncUrl.endsWith('/') ? adminSyncUrl : `${adminSyncUrl}/`;
  const trimmedPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(trimmedPath, baseUrl).toString();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-sync-secret': adminSyncSecret,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Admin sync failed (${res.status}): ${body}`);
  }
}

function getBackoffSeconds(attempt) {
  if (attempt <= 1) return 15;
  if (attempt === 2) return 60;
  if (attempt === 3) return 5 * 60;
  if (attempt === 4) return 15 * 60;
  if (attempt === 5) return 60 * 60;
  return 6 * 60 * 60;
}

async function claimBatch(pool, limit) {
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
     RETURNING id, event_type, payload, attempts`,
    [limit]
  );
  return rows;
}

async function markSuccess(pool, id) {
  await pool.query('DELETE FROM sync_outbox WHERE id = $1', [id]);
}

async function markFailure(pool, id, attempts, lastError) {
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

async function refreshOutboxStatus(pool) {
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
  const status = pendingCount > 0 ? 'degraded' : 'healthy';

  const degradedAt = previousStatus !== 'degraded' && status === 'degraded' ? new Date() : null;
  const recoveredAt = previousStatus !== 'healthy' && status === 'healthy' ? new Date() : null;

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
    [status, pendingCount, oldestPendingAt, lastError, degradedAt, recoveredAt]
  );
}

async function main() {
  const pool = new Pool({ connectionString: studioDbUrl });

  try {
    let processed = 0;
    while (true) {
      const batch = await claimBatch(pool, 25);
      if (batch.length === 0) break;

      for (const event of batch) {
        const path = EVENT_PATHS[event.event_type];
        if (!path) {
          await markFailure(pool, event.id, event.attempts, `Unknown event type: ${event.event_type}`);
          continue;
        }

        try {
          let payload = event.payload;
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
            } catch {
              payload = {};
            }
          }
          await postAdmin(path, payload);
          await markSuccess(pool, event.id);
          processed += 1;
        } catch (error) {
          const message = error?.message || 'Admin sync failed';
          await markFailure(pool, event.id, event.attempts, message);
        }
      }
    }

    await refreshOutboxStatus(pool);
    console.log(`Outbox processing complete. Delivered ${processed} events.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Outbox processing failed:', error);
  process.exit(1);
});
