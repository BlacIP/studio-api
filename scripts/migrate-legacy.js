const { Pool } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
dotenv.config();

const adminDbUrl =
  process.env.ADMIN_DB_URL ||
  process.env.ADMIN_DATABASE_URL ||
  process.env.ADMIN_DATABASE_URL_DEV ||
  process.env.ADMIN_DATABASE_URL_PROD;

const studioDbUrl = process.env.STUDIO_DATABASE_URL || process.env.DATABASE_URL;

const legacyStudioId = process.env.LEGACY_STUDIO_ID || randomUUID();
const legacyStudioName = process.env.LEGACY_STUDIO_NAME || 'Legacy Studio';
const legacyStudioSlug = process.env.LEGACY_STUDIO_SLUG || 'legacy-studio';
const legacyOwnerEmail = process.env.LEGACY_OWNER_EMAIL || 'legacy@studio.com';
const legacyOwnerId = process.env.LEGACY_OWNER_ID || randomUUID();
const legacyOwnerPassword = process.env.LEGACY_OWNER_PASSWORD;

const adminSyncUrl = process.env.ADMIN_SYNC_URL;
const adminSyncSecret = process.env.ADMIN_SYNC_SECRET;

if (!adminDbUrl) {
  console.error('Missing ADMIN_DB_URL (admin DB connection string).');
  process.exit(1);
}

if (!studioDbUrl) {
  console.error('Missing STUDIO_DATABASE_URL or DATABASE_URL (studio DB connection string).');
  process.exit(1);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function postAdmin(path, payload) {
  if (!adminSyncUrl || !adminSyncSecret) return;

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

async function ensureLegacyStudio(studioPool) {
  let studioResult = await studioPool.query(
    'SELECT id, name, slug, status, plan, created_at FROM studios WHERE slug = $1',
    [legacyStudioSlug]
  );

  if (studioResult.rows.length === 0) {
    studioResult = await studioPool.query(
      `INSERT INTO studios (id, name, slug, status, plan)
       VALUES ($1, $2, $3, 'ACTIVE', 'free')
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         slug = EXCLUDED.slug,
         status = EXCLUDED.status,
         plan = EXCLUDED.plan
       RETURNING id, name, slug, status, plan, created_at`,
      [legacyStudioId, legacyStudioName, legacyStudioSlug]
    );
  }

  const studio = studioResult.rows[0];

  const passwordHash = await bcrypt.hash(legacyOwnerPassword || randomUUID(), 10);

  await studioPool.query(
    `INSERT INTO studio_users (id, studio_id, email, password_hash, role, permissions, auth_provider)
     VALUES ($1, $2, $3, $4, 'OWNER', '{}', 'local')
     ON CONFLICT (studio_id, email) DO NOTHING`,
    [legacyOwnerId, studio.id, legacyOwnerEmail, passwordHash]
  );

  return studio;
}

async function getTableColumns(pool, tableName) {
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function main() {
  const adminPool = new Pool({ connectionString: adminDbUrl });
  const studioPool = new Pool({ connectionString: studioDbUrl });

  try {
    const legacyStudio = await ensureLegacyStudio(studioPool);
    const resolvedStudioId = legacyStudio.id;
    console.log('Legacy studio:', legacyStudio.id, legacyStudio.slug);

    const photoColumns = await getTableColumns(studioPool, 'photos');

    if (adminSyncUrl && adminSyncSecret) {
      await postAdmin('/studios/sync', {
        id: legacyStudio.id,
        name: legacyStudio.name,
        slug: legacyStudio.slug,
        status: legacyStudio.status,
        plan: legacyStudio.plan,
        created_at: legacyStudio.created_at,
      });
    }

    const existingSlugsRes = await studioPool.query(
      'SELECT slug FROM clients WHERE studio_id = $1',
      [resolvedStudioId]
    );
    const usedSlugs = new Set(existingSlugsRes.rows.map((row) => row.slug));

    const clientsRes = await adminPool.query('SELECT * FROM clients ORDER BY created_at ASC');
    console.log(`Migrating ${clientsRes.rows.length} clients...`);

    for (const client of clientsRes.rows) {
      const existingClientRes = await studioPool.query(
        'SELECT slug FROM clients WHERE id = $1',
        [client.id]
      );

      const name = client.name || 'Untitled Client';
      let slug = client.slug || slugify(name) || `client-${client.id.slice(0, 8)}`;
      if (existingClientRes.rows.length > 0) {
        slug = existingClientRes.rows[0].slug;
      } else {
        let candidate = slug;
        let suffix = 1;
        while (usedSlugs.has(candidate)) {
          suffix += 1;
          candidate = `${slug}-${suffix}`;
        }
        slug = candidate;
      }
      usedSlugs.add(slug);

      const eventDate = client.event_date || toDateOnly(client.created_at) || toDateOnly(new Date());

      await studioPool.query(
        `INSERT INTO clients
         (id, studio_id, name, slug, subheading, event_date, status, status_updated_at, header_media_url, header_media_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           studio_id = EXCLUDED.studio_id,
           name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           subheading = EXCLUDED.subheading,
           event_date = EXCLUDED.event_date,
           status = EXCLUDED.status,
           status_updated_at = EXCLUDED.status_updated_at,
           header_media_url = EXCLUDED.header_media_url,
           header_media_type = EXCLUDED.header_media_type`,
        [
          client.id,
          resolvedStudioId,
          name,
          slug,
          client.subheading || null,
          eventDate,
          client.status || 'ACTIVE',
          client.status_updated_at || null,
          client.header_media_url || null,
          client.header_media_type || null,
          client.created_at || null,
        ]
      );

      const photosRes = await adminPool.query('SELECT * FROM photos WHERE client_id = $1', [client.id]);
      let photoCount = 0;
      let storageBytes = 0;

      for (const photo of photosRes.rows) {
        photoCount += 1;
        storageBytes += Number(photo.size || 0);

        const columns = ['id', 'client_id', 'url', 'filename', 'public_id'];
        const values = [
          photo.id,
          client.id,
          photo.url,
          photo.filename || null,
          photo.public_id,
        ];

        if (photoColumns.has('studio_id')) {
          columns.push('studio_id');
          values.push(resolvedStudioId);
        }

        if (photoColumns.has('size')) {
          columns.push('size');
          values.push(photo.size || null);
        }
        if (photoColumns.has('width')) {
          columns.push('width');
          values.push(photo.width || null);
        }
        if (photoColumns.has('height')) {
          columns.push('height');
          values.push(photo.height || null);
        }
        if (photoColumns.has('format')) {
          columns.push('format');
          values.push(photo.format || null);
        }
        if (photoColumns.has('resource_type')) {
          columns.push('resource_type');
          values.push(photo.resource_type || null);
        }
        if (photoColumns.has('created_at')) {
          columns.push('created_at');
          values.push(photo.created_at || null);
        }

        const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
        const updates = columns
          .filter((col) => col !== 'id')
          .map((col) => `${col} = EXCLUDED.${col}`)
          .join(', ');

        await studioPool.query(
          `INSERT INTO photos (${columns.join(', ')})
           VALUES (${placeholders})
           ON CONFLICT (id) DO UPDATE SET ${updates}`,
          values
        );
      }

      if (adminSyncUrl && adminSyncSecret) {
        await postAdmin('/clients/sync', {
          studioId: resolvedStudioId,
          clientId: client.id,
          name,
          slug,
          subheading: client.subheading || null,
          event_date: eventDate,
          status: client.status || 'ACTIVE',
          created_at: client.created_at || null,
        });

        await postAdmin('/clients/stats', {
          studioId: resolvedStudioId,
          clientId: client.id,
          photoCount,
          storageBytes,
        });
      }
    }

    console.log('Migration complete.');
    console.log('Legacy studio id:', resolvedStudioId);
    console.log('Legacy owner email:', legacyOwnerEmail);
  } finally {
    await adminPool.end();
    await studioPool.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
