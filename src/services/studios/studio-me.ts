import { pool } from '../../lib/db';
import cloudinary from '../../lib/cloudinary';
import { syncStudioToAdmin } from '../../lib/admin-sync';
import { AppError } from '../../lib/errors';
import { normalizeOptionalString, normalizeSocialLinks, toSlug } from './studio-utils';

export async function getStudioMe(studioId: string) {
  const result = await pool.query(
    `SELECT id,
            name,
            slug,
            status,
            plan,
            logo_url,
            logo_public_id,
            contact_email,
            contact_phone,
            address,
            social_links
     FROM studios
     WHERE id = $1`,
    [studioId]
  );
  const studio = result.rows[0];
  if (!studio) {
    throw new AppError('Studio not found', 404);
  }
  return studio;
}

export async function updateStudioMe({
  studioId,
  name,
  slug,
  logo_url,
  logo_public_id,
  clear_logo,
  contact_email,
  contact_phone,
  address,
  social_links,
}: {
  studioId: string;
  name: string;
  slug?: string;
  logo_url?: string;
  logo_public_id?: string;
  clear_logo?: boolean;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  social_links?: Record<string, string> | null;
}) {
  const finalSlug = slug ? toSlug(slug) : toSlug(name);
  if (!finalSlug) {
    throw new AppError('slug is required', 400);
  }

  const existing = await pool.query(
    'SELECT id FROM studios WHERE slug = $1 AND id <> $2',
    [finalSlug, studioId]
  );
  if (existing.rows.length > 0) {
    throw new AppError('Slug already in use', 409);
  }

  const normalizedLogoUrl = normalizeOptionalString(logo_url);
  const normalizedLogoPublicId = normalizeOptionalString(logo_public_id);
  const normalizedContactEmail = normalizeOptionalString(contact_email);
  const normalizedContactPhone = normalizeOptionalString(contact_phone);
  const normalizedAddress = normalizeOptionalString(address);
  const normalizedSocialLinks = normalizeSocialLinks(social_links);
  const clearLogo = clear_logo === true;

  const existingLogoRes = await pool.query('SELECT logo_public_id FROM studios WHERE id = $1', [
    studioId,
  ]);
  const existingLogoPublicId = existingLogoRes.rows[0]?.logo_public_id || null;

  const update = await pool.query(
    `UPDATE studios
     SET name = $1,
         slug = $2,
         status = 'ACTIVE',
         logo_url = CASE WHEN $10 THEN NULL ELSE COALESCE($3, logo_url) END,
         logo_public_id = CASE WHEN $10 THEN NULL ELSE COALESCE($4, logo_public_id) END,
         contact_email = COALESCE($5, contact_email),
         contact_phone = COALESCE($6, contact_phone),
         address = COALESCE($7, address),
         social_links = COALESCE($8, social_links)
     WHERE id = $9
     RETURNING id, name, slug, status, plan, created_at, logo_url, logo_public_id, contact_email, contact_phone, address, social_links`,
    [
      name,
      finalSlug,
      normalizedLogoUrl,
      normalizedLogoPublicId,
      normalizedContactEmail,
      normalizedContactPhone,
      normalizedAddress,
      normalizedSocialLinks,
      studioId,
      clearLogo,
    ]
  );

  const studio = update.rows[0];
  await syncStudioToAdmin({
    id: studio.id,
    name: studio.name,
    slug: studio.slug,
    status: studio.status,
    plan: studio.plan || 'free',
    created_at: studio.created_at,
  });

  if (clearLogo && existingLogoPublicId) {
    try {
      await cloudinary.uploader.destroy(existingLogoPublicId);
    } catch (error) {
      console.error('Studio logo delete error', error);
    }
  } else if (existingLogoPublicId && normalizedLogoPublicId && existingLogoPublicId !== normalizedLogoPublicId) {
    try {
      await cloudinary.uploader.destroy(existingLogoPublicId);
    } catch (error) {
      console.error('Studio logo delete error', error);
    }
  }

  return studio;
}
