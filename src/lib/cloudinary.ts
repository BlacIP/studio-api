import { v2 as cloudinary } from 'cloudinary';

const cloudinaryConfig = process.env.CLOUDINARY_URL
  ? { cloudinary_url: process.env.CLOUDINARY_URL }
  : {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    };

if (cloudinaryConfig) {
  cloudinary.config(cloudinaryConfig);
}

export default cloudinary;

type UploadFolderParams = {
  studioId: string;
  clientId: string;
};

export function getCloudinaryFolder({ studioId, clientId }: UploadFolderParams): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const root = process.env.CLOUDINARY_ROOT_FOLDER || 'photolibrary';
  const targetRoot = isDevelopment ? `${root}-demo` : root;
  return `${targetRoot}/${studioId}/${clientId}`;
}

type StudioLogoParams = {
  studioId: string;
};

export function getStudioLogoFolder({ studioId }: StudioLogoParams): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const root = process.env.CLOUDINARY_ROOT_FOLDER || 'photolibrary';
  const targetRoot = isDevelopment ? `${root}-demo` : root;
  return `${targetRoot}/studio-logo/${studioId}`;
}

export async function signUploadRequest(params: UploadFolderParams) {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const apiSecret = cloudinary.config().api_secret || process.env.CLOUDINARY_API_SECRET;

  if (!apiSecret) {
    throw new Error('Cloudinary API Secret not found');
  }

  const folder = getCloudinaryFolder(params);
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, apiSecret);

  return { timestamp, signature, folder };
}

export async function signStudioLogoUploadRequest(params: StudioLogoParams) {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const apiSecret = cloudinary.config().api_secret || process.env.CLOUDINARY_API_SECRET;

  if (!apiSecret) {
    throw new Error('Cloudinary API Secret not found');
  }

  const folder = getStudioLogoFolder(params);
  const publicId = 'logo';
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, public_id: publicId, overwrite: true },
    apiSecret
  );

  return { timestamp, signature, folder, publicId };
}
