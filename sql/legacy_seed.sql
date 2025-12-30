-- Replace the UUIDs and email before running.
INSERT INTO studios (id, name, slug, status, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Legacy Studio', 'legacy-studio', 'ACTIVE', 'free')
ON CONFLICT (id) DO NOTHING;

INSERT INTO studio_users (id, studio_id, email, password_hash, role, permissions, auth_provider)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'legacy-owner@example.com',
  'REPLACE_WITH_BCRYPT_HASH',
  'OWNER',
  '{}',
  'local'
)
ON CONFLICT (id) DO NOTHING;
