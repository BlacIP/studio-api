import {
  OutboxEventType,
  claimOutboxBatch,
  markOutboxFailure,
  markOutboxSuccess,
  refreshOutboxStatus,
} from './outbox';
import { postToAdmin } from './admin-sync-client';

const OUTBOX_PATHS: Record<OutboxEventType, string> = {
  'studio.sync': '/studios/sync',
  'client.sync': '/clients/sync',
  'client.stats': '/clients/stats',
  'studio.owner.sync': '/studios/owners/sync',
};

type OutboxBatchResult = {
  processed: number;
  failed: number;
};

function normalizePayload(payload: unknown): unknown {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  return payload;
}

async function handleBatch(batch: Array<{
  id: string;
  event_type: OutboxEventType;
  payload: unknown;
  attempts: number;
}>): Promise<OutboxBatchResult> {
  let processed = 0;
  let failed = 0;

  for (const event of batch) {
    const path = OUTBOX_PATHS[event.event_type];
    if (!path) {
      await markOutboxFailure(event.id, event.attempts, `Unknown event type: ${event.event_type}`);
      failed += 1;
      continue;
    }

    try {
      const payload = normalizePayload(event.payload);
      await postToAdmin(path, payload);
      await markOutboxSuccess(event.id);
      processed += 1;
    } catch (error: any) {
      const message = error?.message || 'Admin sync failed';
      await markOutboxFailure(event.id, event.attempts, message);
      failed += 1;
    }
  }

  return { processed, failed };
}

export async function processOutboxBatch(limit = 5): Promise<OutboxBatchResult> {
  const batch = await claimOutboxBatch(limit);
  if (batch.length === 0) {
    await refreshOutboxStatus();
    return { processed: 0, failed: 0 };
  }

  const result = await handleBatch(batch);
  await refreshOutboxStatus();
  return result;
}

export async function processOutboxUntilEmpty(limit = 25): Promise<OutboxBatchResult> {
  let processed = 0;
  let failed = 0;

  while (true) {
    const batch = await claimOutboxBatch(limit);
    if (batch.length === 0) break;

    const result = await handleBatch(batch);
    processed += result.processed;
    failed += result.failed;
  }

  await refreshOutboxStatus();
  return { processed, failed };
}
