export type StudioUser = {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  permissions?: string[];
  studio_id: string;
};

export type Studio = {
  id: string;
  name: string;
  slug: string;
  status: string;
};
