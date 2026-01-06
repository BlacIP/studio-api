import { signUploadRequest } from '../../lib/cloudinary';
import { ensureClientExists, getCloudinaryKeys } from './photos-helpers';

export async function getUploadSignaturePayload({
  studioId,
  clientId,
}: {
  studioId: string;
  clientId: string;
}) {
  await ensureClientExists(studioId, clientId);

  const { timestamp, signature, folder } = await signUploadRequest({
    studioId,
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
