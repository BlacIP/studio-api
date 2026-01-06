import cloudinary from '../../lib/cloudinary';
import { signUploadRequest } from '../../lib/cloudinary';
import { AppError } from '../../lib/errors';
import { pool } from '../../lib/db';
import { getLegacyStudio } from './legacy-studio';

function getCloudinaryKeys() {
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

export async function getLegacyUploadSignature(clientId: string) {
  const legacyStudio = await getLegacyStudio();

  const clientCheck = await pool.query(
    'SELECT id FROM clients WHERE id = $1 AND studio_id = $2',
    [clientId, legacyStudio.id]
  );
  if (clientCheck.rows.length === 0) {
    throw new AppError('Client not found', 404);
  }

  const { timestamp, signature, folder } = await signUploadRequest({
    studioId: legacyStudio.id,
    clientId,
  });

  const { cloudName, apiKey } = getCloudinaryKeys();

  return {
    timestamp,
    signature,
    folder,
    cloudName,
    apiKey,
    cloud_name: cloudName,
    api_key: apiKey,
  };
}
