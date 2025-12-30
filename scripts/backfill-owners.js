const { Pool } = require('@neondatabase/serverless');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
dotenv.config();

const studioDbUrl = process.env.STUDIO_DATABASE_URL || process.env.DATABASE_URL;
const adminSyncUrl = process.env.ADMIN_SYNC_URL;
const adminSyncSecret = process.env.ADMIN_SYNC_SECRET;
const studioIdFilter = process.env.STUDIO_ID;

if (!studioDbUrl) {
  console.error('Missing STUDIO_DATABASE_URL or DATABASE_URL (studio DB connection string).');
  process.exit(1);
}

if (!adminSyncUrl || !adminSyncSecret) {
  console.error('Missing ADMIN_SYNC_URL or ADMIN_SYNC_SECRET (admin sync config).');
  process.exit(1);
}

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

async function main() {
  const studioPool = new Pool({ connectionString: studioDbUrl });

  try {
    const params = [];
    let where = "WHERE u.role = 'OWNER'";
    if (studioIdFilter) {
      params.push(studioIdFilter);
      where += ' AND u.studio_id = $1';
    }

    const ownersRes = await studioPool.query(
      `SELECT u.id, u.studio_id, u.email, u.role, u.auth_provider, u.display_name, u.avatar_url, u.created_at
       FROM studio_users u
       ${where}
       ORDER BY u.created_at ASC`,
      params
    );

    console.log(`Syncing ${ownersRes.rows.length} owners...`);

    for (const owner of ownersRes.rows) {
      await postAdmin('/studios/owners/sync', {
        studioId: owner.studio_id,
        ownerId: owner.id,
        email: owner.email,
        role: owner.role,
        authProvider: owner.auth_provider || 'local',
        displayName: owner.display_name || null,
        avatarUrl: owner.avatar_url || null,
        createdAt: owner.created_at || null,
      });
    }

    console.log('Owner backfill complete.');
  } finally {
    await studioPool.end();
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
