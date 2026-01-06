import { Response, Request } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { AppError } from '../lib/errors';
import {
  getClientBySlug,
  getClientByStudioAndSlug,
  respondWithGallery,
  streamGalleryDownload,
} from '../services/gallery/gallery-service';

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
