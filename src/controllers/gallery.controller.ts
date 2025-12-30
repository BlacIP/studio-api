import { Response, Request } from 'express';
import { pool } from '../lib/db';
import archiver from 'archiver';
import https from 'https';

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
};

async function getClientByStudioAndSlug(studioSlug: string, clientSlug: string) {
  const result = await pool.query<GalleryClientRow>(
    `SELECT c.*, s.slug AS studio_slug
     FROM clients c
     JOIN studios s ON s.id = c.studio_id
     WHERE s.slug = $1 AND c.slug = $2`,
    [studioSlug, clientSlug]
  );
  return result.rows;
}

async function getClientBySlug(clientSlug: string) {
  const result = await pool.query<GalleryClientRow>(
    `SELECT c.*, s.slug AS studio_slug
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

  res.json({
    id: client.id,
    name: client.name,
    slug: client.slug,
    event_date: client.event_date,
    subheading: client.subheading,
    status: client.status || 'ACTIVE',
    header_media_url: client.header_media_url,
    header_media_type: client.header_media_type,
    studio_slug: client.studio_slug,
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

export async function getGallery(req: Request, res: Response): Promise<void> {
  try {
    const { studioSlug, clientSlug } = req.params;
    const rows = await getClientByStudioAndSlug(studioSlug, clientSlug);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    await respondWithGallery(rows[0], res);
  } catch (error) {
    console.error('Error fetching gallery:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

export async function getGalleryBySlug(req: Request, res: Response): Promise<void> {
  try {
    const { slug } = req.params;
    const rows = await getClientBySlug(slug);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    if (rows.length > 1) {
      res.status(409).json({ error: 'Multiple studios found. Use studioSlug + clientSlug.' });
      return;
    }

    await respondWithGallery(rows[0], res);
  } catch (error) {
    console.error('Error fetching gallery by slug:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

export async function downloadGallery(req: Request, res: Response): Promise<void> {
  try {
    const { studioSlug, clientSlug } = req.params;
    const rows = await getClientByStudioAndSlug(studioSlug, clientSlug);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Gallery not found' });
      return;
    }

    await streamGalleryDownload(rows[0], res);
  } catch (error) {
    console.error('Download gallery error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  }
}

export async function downloadGalleryBySlug(req: Request, res: Response): Promise<void> {
  try {
    const { slug } = req.params;
    const rows = await getClientBySlug(slug);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Gallery not found' });
      return;
    }

    if (rows.length > 1) {
      res.status(409).json({ error: 'Multiple studios found. Use studioSlug + clientSlug.' });
      return;
    }

    await streamGalleryDownload(rows[0], res);
  } catch (error) {
    console.error('Download gallery by slug error', error);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  }
}

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
