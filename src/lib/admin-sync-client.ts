type AdminSyncConfig = {
  baseUrl: string;
  secret: string;
};

export function getAdminSyncConfig(): AdminSyncConfig | null {
  const baseUrl = process.env.ADMIN_SYNC_URL;
  const secret = process.env.ADMIN_SYNC_SECRET;
  if (!baseUrl || !secret) {
    return null;
  }
  return { baseUrl, secret };
}

export async function postToAdmin(path: string, payload: unknown): Promise<void> {
  const cfg = getAdminSyncConfig();
  if (!cfg) {
    throw new Error('Admin sync config missing');
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
    body: JSON.stringify(payload ?? {}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Admin sync failed (${res.status}): ${body}`);
  }
}
