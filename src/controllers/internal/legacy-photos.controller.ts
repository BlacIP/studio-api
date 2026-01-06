import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { AppError } from '../../lib/errors';
import { fail, success } from '../../lib/http';
import {
  deleteLegacyPhoto as deleteLegacyPhotoService,
  getLegacyUploadSignature as getLegacyUploadSignatureService,
  saveLegacyPhotoRecord as saveLegacyPhotoRecordService,
  saveLegacyPhotoRecords as saveLegacyPhotoRecordsService,
} from '../../services/internal/legacy-photos';

export const getLegacyUploadSignature = asyncHandler(async (req: Request, res: Response) => {
  const { clientId } = req.body || {};
  if (!clientId) {
    throw new AppError('clientId is required', 400);
  }

  const payload = await getLegacyUploadSignatureService(clientId);
  return success(res, payload);
});

export const saveLegacyPhotoRecord = asyncHandler(async (req: Request, res: Response) => {
  const { clientId, publicId, url, filename, bytes, width, height, format, resourceType, resource_type } = req.body || {};

  if (!clientId || !publicId || !url) {
    throw new AppError('clientId, publicId, and url are required', 400);
  }

  const result = await saveLegacyPhotoRecordService({
    clientId,
    publicId,
    url,
    filename,
    bytes,
    width,
    height,
    format,
    resourceType: resourceType || resource_type,
  });

  return success(res, result);
});

export const saveLegacyPhotoRecords = asyncHandler(async (req: Request, res: Response) => {
  const { clientId, photos } = req.body || {};

  if (!clientId || !Array.isArray(photos)) {
    throw new AppError('clientId and photos are required', 400);
  }

  const result = await saveLegacyPhotoRecordsService({
    clientId,
    photos,
  });

  if (result.empty) {
    return fail(res, 'No valid photos to save', 400, {
      invalid: result.invalid,
      duplicates: result.duplicates,
    });
  }

  return success(res, {
    inserted: result.inserted,
    skipped_existing: result.skipped_existing,
    skipped_duplicate: result.skipped_duplicate,
    invalid: result.invalid,
  });
});

export const deleteLegacyPhoto = asyncHandler(async (req: Request, res: Response) => {
  const result = await deleteLegacyPhotoService(req.params.id);
  return success(res, result);
});
