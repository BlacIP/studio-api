import { enqueueOutbox, OutboxEventType } from './outbox';
import { postToAdmin } from './admin-sync-client';

type SyncClientPayload = {
  studioId: string;
  clientId: string;
  name?: string;
  slug?: string;
  subheading?: string | null;
  event_date?: string | null;
  status?: string | null;
  created_at?: string | null;
  deleted?: boolean;
};

type SyncStudioPayload = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  created_at?: string;
};

type SyncClientStatsPayload = {
  studioId: string;
  clientId: string;
  deltaCount?: number;
  deltaBytes?: number;
  photoCount?: number;
  storageBytes?: number;
};

type SyncStudioOwnerPayload = {
  studioId: string;
  ownerId: string;
  email: string;
  role: string;
  authProvider: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  createdAt?: string | null;
  deleted?: boolean;
};

async function safePost(eventType: OutboxEventType, path: string, payload: unknown) {
  try {
    await postToAdmin(path, payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Admin sync failed';
    await enqueueOutbox(eventType, payload, message);
    console.error(`Admin sync error (${eventType}):`, error);
  }
}

export async function syncStudioToAdmin(payload: SyncStudioPayload) {
  try {
    await safePost('studio.sync', '/studios/sync', payload);
  } catch (error) {
    console.error('Admin studio sync error:', error);
  }
}

export async function syncClientToAdmin(payload: SyncClientPayload) {
  try {
    await safePost('client.sync', '/clients/sync', payload);
  } catch (error) {
    console.error('Admin client sync error:', error);
  }
}

export async function syncClientStatsToAdmin(payload: SyncClientStatsPayload) {
  try {
    await safePost('client.stats', '/clients/stats', payload);
  } catch (error) {
    console.error('Admin client stats sync error:', error);
  }
}

export async function syncStudioOwnerToAdmin(payload: SyncStudioOwnerPayload) {
  try {
    await safePost('studio.owner.sync', '/studios/owners/sync', payload);
  } catch (error) {
    console.error('Admin studio owner sync error:', error);
  }
}
