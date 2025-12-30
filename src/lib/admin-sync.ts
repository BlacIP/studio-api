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

function getAdminSyncConfig() {
  const baseUrl = process.env.ADMIN_SYNC_URL;
  const secret = process.env.ADMIN_SYNC_SECRET;
  if (!baseUrl || !secret) {
    return null;
  }
  return { baseUrl, secret };
}

async function postToAdmin(path: string, payload: unknown) {
  const cfg = getAdminSyncConfig();
  if (!cfg) {
    return;
  }

  const trimmedPath = path.startsWith('/') ? path.slice(1) : path;
  const baseUrl = cfg.baseUrl.endsWith('/') ? cfg.baseUrl : `${cfg.baseUrl}/`;
  const url = new URL(trimmedPath, baseUrl).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-sync-secret': cfg.secret,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Admin sync failed (${res.status}): ${body}`);
  }
}

export async function syncStudioToAdmin(payload: SyncStudioPayload) {
  try {
    await postToAdmin('/studios/sync', payload);
  } catch (error) {
    console.error('Admin studio sync error:', error);
  }
}

export async function syncClientToAdmin(payload: SyncClientPayload) {
  try {
    await postToAdmin('/clients/sync', payload);
  } catch (error) {
    console.error('Admin client sync error:', error);
  }
}

export async function syncClientStatsToAdmin(payload: SyncClientStatsPayload) {
  try {
    await postToAdmin('/clients/stats', payload);
  } catch (error) {
    console.error('Admin client stats sync error:', error);
  }
}

export async function syncStudioOwnerToAdmin(payload: SyncStudioOwnerPayload) {
  try {
    await postToAdmin('/studios/owners/sync', payload);
  } catch (error) {
    console.error('Admin studio owner sync error:', error);
  }
}
