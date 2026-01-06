import { pool } from '../../lib/db';
import { refreshOutboxStatus } from '../../lib/outbox';
import { processOutboxUntilEmpty } from '../../lib/outbox-processor';

export async function processOutbox() {
  const { processed, failed } = await processOutboxUntilEmpty(25);
  return { success: true, processed, failed };
}

export async function processOutboxIfNeeded() {
  await refreshOutboxStatus();
  const statusRes = await pool.query(
    `SELECT status, pending_count, last_degraded_at, last_recovered_at
     FROM sync_outbox_status
     WHERE id = 1`
  );
  const statusRow = statusRes.rows[0] || { status: 'healthy', pending_count: 0 };
  const pendingCount = Number(statusRow.pending_count || 0);

  if (pendingCount === 0) {
    return {
      success: true,
      skipped: true,
      processed: 0,
      failed: 0,
      pending_count: 0,
      status: statusRow.status,
    };
  }

  const { processed, failed } = await processOutboxUntilEmpty(25);
  await refreshOutboxStatus();
  const refreshed = await pool.query(
    `SELECT status, pending_count, last_degraded_at, last_recovered_at
     FROM sync_outbox_status
     WHERE id = 1`
  );
  const updated = refreshed.rows[0] || statusRow;

  return {
    success: true,
    skipped: false,
    processed,
    failed,
    pending_count: updated.pending_count,
    status: updated.status,
  };
}

export async function getOutboxStatus() {
  const statusRes = await pool.query('SELECT * FROM sync_outbox_status WHERE id = 1');
  if (statusRes.rows.length === 0) {
    await refreshOutboxStatus();
    const refreshed = await pool.query('SELECT * FROM sync_outbox_status WHERE id = 1');
    return refreshed.rows[0] || { status: 'healthy', pending_count: 0 };
  }

  return statusRes.rows[0];
}
