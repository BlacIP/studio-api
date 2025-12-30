export type StudioUser = {
  id: string;
  email: string;
  password_hash?: string | null;
  role: string;
  permissions?: string[] | null;
  studio_id: string;
  auth_provider?: string | null;
  provider_id?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

export type Studio = {
  id: string;
  name?: string | null;
  slug?: string | null;
  status: string;
};
