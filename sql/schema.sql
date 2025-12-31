CREATE TABLE IF NOT EXISTS studios (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ONBOARDING',
  plan TEXT NOT NULL DEFAULT 'free',
  logo_url TEXT,
  logo_public_id TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  social_links JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studio_users (
  id UUID PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'OWNER',
  permissions TEXT[] NOT NULL DEFAULT '{}',
  auth_provider TEXT NOT NULL DEFAULT 'local',
  provider_id TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (studio_id, email)
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  subheading TEXT,
  event_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  status_updated_at TIMESTAMPTZ,
  header_media_url TEXT,
  header_media_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (studio_id, slug)
);

CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  filename TEXT,
  public_id TEXT NOT NULL,
  size INTEGER,
  width INTEGER,
  height INTEGER,
  format TEXT,
  resource_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_outbox_status_next_retry_idx
  ON sync_outbox (status, next_retry_at);

CREATE TABLE IF NOT EXISTS sync_outbox_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'healthy',
  pending_count INTEGER NOT NULL DEFAULT 0,
  oldest_pending_at TIMESTAMPTZ,
  last_error TEXT,
  last_degraded_at TIMESTAMPTZ,
  last_recovered_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
