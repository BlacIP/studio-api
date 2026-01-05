import { Response, Request } from 'express';
import { pool } from '../lib/db';
import archiver from 'archiver';
import https from 'https';
import { asyncHandler } from '../middleware/async-handler';
import { AppError } from '../lib/errors';
import { success } from '../lib/http';

type GalleryClientRow = {
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

async function getClientByStudioAndSlug(studioSlug: string, clientSlug: string) {
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

async function getClientBySlug(clientSlug: string) {
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

async function respondWithGallery(client: GalleryClientRow, res: Response) {
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

async function streamGalleryDownload(client: GalleryClientRow, res: Response) {
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

    try {
      await new Promise<void>((resolve) => {
        fetchImageStream(photo.url)
          .then((stream) => {
            if (stream) {
              archive.append(stream, { name: photo.filename || `photo_${photo.id}.jpg` });
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

export const getGallery = asyncHandler(async (req: Request, res: Response) => {
  const { studioSlug, clientSlug } = req.params;
  const rows = await getClientByStudioAndSlug(studioSlug, clientSlug);

  if (rows.length === 0) {
    throw new AppError('Client not found', 404);
  }

  await respondWithGallery(rows[0], res);
});

export const getGalleryBySlug = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;
  const rows = await getClientBySlug(slug);

  if (rows.length === 0) {
    throw new AppError('Client not found', 404);
  }

  if (rows.length > 1) {
    throw new AppError('Multiple studios found. Use studioSlug + clientSlug.', 409);
  }

  await respondWithGallery(rows[0], res);
});

export const downloadGallery = asyncHandler(async (req: Request, res: Response) => {
  const { studioSlug, clientSlug } = req.params;
  const rows = await getClientByStudioAndSlug(studioSlug, clientSlug);

  if (rows.length === 0) {
    throw new AppError('Gallery not found', 404);
  }

  try {
    await streamGalleryDownload(rows[0], res);
  } catch (error) {
    console.error('Download gallery error:', error);
    if (!res.headersSent) {
      throw new AppError('Download failed', 500);
    }
  }
});

export const downloadGalleryBySlug = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;
  const rows = await getClientBySlug(slug);

  if (rows.length === 0) {
    throw new AppError('Gallery not found', 404);
  }

  if (rows.length > 1) {
    throw new AppError('Multiple studios found. Use studioSlug + clientSlug.', 409);
  }

  try {
    await streamGalleryDownload(rows[0], res);
  } catch (error) {
    console.error('Download gallery by slug error', error);
    if (!res.headersSent) {
      throw new AppError('Download failed', 500);
    }
  }
});

function fetchImageStream(url: string, attempt = 1): Promise<any> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : require('http');

    const req = protocol.get(url, (response: any) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        if (attempt > 3) {
          resolve(null);
          return;
        }
        const redirectUrl = response.headers.location;
        return resolve(fetchImageStream(redirectUrl, attempt + 1));
      }

      if (response.statusCode === 200) {
        resolve(response);
        return;
      }

      if (response.statusCode === 404 && url.includes('/upload/v')) {
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
