import { Response } from 'express';
import archiver from 'archiver';
import https from 'https';
import http, { type IncomingMessage } from 'http';
import { pool } from '../../lib/db';
import { success } from '../../lib/http';

export type GalleryClientRow = {
  id: string;
  name: string;
  slug: string;
  event_date: string | null;
  subheading: string | null;
  status: string | null;
  header_media_url: string | null;
  header_media_type: string | null;
  studio_slug?: string | null;
  studio_name?: string | null;
  studio_logo_url?: string | null;
  studio_contact_email?: string | null;
  studio_contact_phone?: string | null;
  studio_address?: string | null;
  studio_social_links?: Record<string, string> | null;
};

export async function getClientByStudioAndSlug(studioSlug: string, clientSlug: string) {
  const result = await pool.query<GalleryClientRow>(
    `SELECT c.*,
            s.slug AS studio_slug,
            s.name AS studio_name,
            s.logo_url AS studio_logo_url,
            s.contact_email AS studio_contact_email,
            s.contact_phone AS studio_contact_phone,
            s.address AS studio_address,
            s.social_links AS studio_social_links
     FROM clients c
     JOIN studios s ON s.id = c.studio_id
     WHERE s.slug = $1 AND c.slug = $2`,
    [studioSlug, clientSlug]
  );
  return result.rows;
}

export async function getClientBySlug(clientSlug: string) {
  const result = await pool.query<GalleryClientRow>(
    `SELECT c.*,
            s.slug AS studio_slug,
            s.name AS studio_name,
            s.logo_url AS studio_logo_url,
            s.contact_email AS studio_contact_email,
            s.contact_phone AS studio_contact_phone,
            s.address AS studio_address,
            s.social_links AS studio_social_links
     FROM clients c
     JOIN studios s ON s.id = c.studio_id
     WHERE c.slug = $1`,
    [clientSlug]
  );
  return result.rows;
}

export async function respondWithGallery(client: GalleryClientRow, res: Response) {
  const photosResult = await pool.query(
    'SELECT id, url, filename, public_id, created_at FROM photos WHERE client_id = $1 ORDER BY created_at DESC',
    [client.id]
  );

  return success(res, {
    id: client.id,
    name: client.name,
    slug: client.slug,
    event_date: client.event_date,
    subheading: client.subheading,
    status: client.status || 'ACTIVE',
    header_media_url: client.header_media_url,
    header_media_type: client.header_media_type,
    studio_slug: client.studio_slug,
    studio: {
      name: client.studio_name,
      slug: client.studio_slug,
      logo_url: client.studio_logo_url,
      contact_email: client.studio_contact_email,
      contact_phone: client.studio_contact_phone,
      address: client.studio_address,
      social_links: client.studio_social_links,
    },
    photos: photosResult.rows,
  });
}

export async function streamGalleryDownload(client: GalleryClientRow, res: Response) {
  const photosRes = await pool.query('SELECT * FROM photos WHERE client_id = $1', [client.id]);
  const photos = photosRes.rows;

  if (!photos.length) {
    res.status(400).json({ error: 'No photos to download' });
    return;
  }

  const archive = archiver('zip', { zlib: { level: 9 } });
  const filename = `${client.name.replace(/[^a-z0-9]/gi, '_')}_Gallery.zip`;
  res.attachment(filename);

  archive.pipe(res);

  for (const photo of photos) {
    if (!photo.url) continue;
    const filename = resolveDownloadFilename(photo);

    try {
      await new Promise<void>((resolve) => {
        fetchImageStream(photo.url)
          .then((stream) => {
            if (stream) {
              archive.append(stream, { name: filename });
              stream.on('end', () => resolve());
              stream.on('error', () => resolve());
            } else {
              resolve();
            }
          })
          .catch(() => resolve());
      });
    } catch (err) {
      console.error(`Processing error for photo ${photo.id}:`, err);
    }
  }

  await archive.finalize();
}

function resolveDownloadFilename(photo: {
  filename?: string | null;
  url?: string | null;
  public_id?: string | null;
  id?: string | null;
}) {
  const directName = normalizeFilename(photo.filename);
  if (directName) return directName;

  const urlName = normalizeFilename(extractFilenameFromUrl(photo.url));
  if (urlName) return urlName;

  if (photo.public_id) {
    const base = photo.public_id.split('/').pop() || photo.public_id;
    return base;
  }

  return `photo_${photo.id || 'image'}.jpg`;
}

function extractFilenameFromUrl(url?: string | null) {
  if (!url) return null;
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split('/').pop();
    return lastSegment ? decodeURIComponent(lastSegment) : null;
  } catch {
    const sanitized = url.split('?')[0];
    const lastSegment = sanitized.split('/').pop();
    return lastSegment ? decodeURIComponent(lastSegment) : null;
  }
}

function normalizeFilename(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function fetchImageStream(url: string, attempt = 1): Promise<IncomingMessage | null> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;

    const req = protocol.get(url, (response: IncomingMessage) => {
      const statusCode = response.statusCode ?? 0;
      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        if (attempt > 3) {
          resolve(null);
          return;
        }
        const redirectUrl = response.headers.location;
        return resolve(fetchImageStream(redirectUrl, attempt + 1));
      }

      if (statusCode === 200) {
        resolve(response);
        return;
      }

      if (statusCode === 404 && url.includes('/upload/v')) {
        const urlWithoutVersion = url.replace(/\/upload\/v\d+\//, '/upload/');
        return resolve(fetchImageStream(urlWithoutVersion, attempt + 1));
      }

      response.resume();
      resolve(null);
    });

    req.on('error', () => {
      resolve(null);
    });
  });
}
