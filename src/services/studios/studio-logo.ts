import cloudinary from '../../lib/cloudinary';
import { signStudioLogoUploadRequest } from '../../lib/cloudinary';

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

export async function getStudioLogoUploadSignature(studioId: string) {
  const { timestamp, signature, folder, publicId } = await signStudioLogoUploadRequest({
    studioId,
  });

  const { cloudName, apiKey } = getCloudinaryKeys();

  return {
    timestamp,
    signature,
    folder,
    publicId,
    cloudName,
    apiKey,
    cloud_name: cloudName,
    api_key: apiKey,
  };
}
