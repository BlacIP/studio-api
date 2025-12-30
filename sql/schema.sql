CREATE TABLE IF NOT EXISTS studios (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ONBOARDING',
  plan TEXT NOT NULL DEFAULT 'free',
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
