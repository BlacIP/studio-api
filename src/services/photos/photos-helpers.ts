import { pool } from '../../lib/db';
import cloudinary from '../../lib/cloudinary';
import { AppError } from '../../lib/errors';

export type PhotoInput = {
  publicId?: string;
  public_id?: string;
  url?: string;
  filename?: string;
  bytes?: number;
  width?: number;
  height?: number;
  format?: string;
  resourceType?: string;
  resource_type?: string;
};

export async function ensureClientExists(studioId: string, clientId: string) {
  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
    [clientId, studioId]
  );
  if (clientCheck.rows.length === 0) {
    throw new AppError('Client not found', 404);
  }
}

export function getCloudinaryKeys() {
  const cfg = cloudinary.config();
  const cloudName =
    cfg.cloud_name ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_URL?.split('@')[1];
  const apiKey =
    cfg.api_key ||
    process.env.CLOUDINARY_API_KEY ||
    process.env.CLOUDINARY_URL?.split(':')[1]?.split('@')[0];

  return { cloudName, apiKey };
}

export function normalizePhotoBatch(photos: PhotoInput[]) {
  const seen = new Set<string>();
  const invalid: number[] = [];
  const duplicates: string[] = [];
  const normalized = photos
    .map((photo, idx) => {
      const publicId = photo?.publicId || photo?.public_id;
      const url = photo?.url;
      if (!publicId || !url) {
        invalid.push(idx);
        return null;
      }
      if (seen.has(publicId)) {
        duplicates.push(publicId);
        return null;
      }
      seen.add(publicId);
      return {
        publicId,
        url,
        filename: photo?.filename,
        bytes: photo?.bytes,
        width: photo?.width,
        height: photo?.height,
        format: photo?.format,
        resourceType: photo?.resourceType || photo?.resource_type,
      };
    })
    .filter(Boolean) as Array<{
    publicId: string;
    url: string;
    filename?: string;
    bytes?: number;
    width?: number;
    height?: number;
    format?: string;
    resourceType?: string;
  }>;

  return { normalized, invalid, duplicates };
}
