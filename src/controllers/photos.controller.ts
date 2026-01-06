import http, { type IncomingMessage } from 'http';
import https from 'https';
import { Response } from 'express';
import { AuthedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/async-handler';
import { AppError } from '../lib/errors';
import { fail, success } from '../lib/http';
import {
  deletePhotoRecord,
  getUploadSignaturePayload,
  savePhotoRecord as savePhotoRecordService,
  savePhotoRecords as savePhotoRecordsService,
} from '../services/photos';

function canManagePhotos(req: AuthedRequest) {
  const role = req.auth?.role;
  const perms = req.auth?.permissions || [];
  return role === 'OWNER' || role === 'ADMIN' || perms.includes('manage_photos') || perms.includes('upload_photos');
}

export const getUploadSignature = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.auth?.studioId) {
    throw new AppError('Unauthorized', 401);
  }

  if (!canManagePhotos(req)) {
    throw new AppError('Permission denied', 403);
  }

  const { clientId } = req.body || {};
  if (!clientId) {
    throw new AppError('clientId is required', 400);
  }

  const payload = await getUploadSignaturePayload({
    studioId: req.auth.studioId,
    clientId,
  });

  return success(res, payload);
});

export const savePhotoRecord = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.auth?.studioId) {
    throw new AppError('Unauthorized', 401);
  }

  const { clientId, publicId, url, filename, bytes, width, height, format, resourceType, resource_type } = req.body || {};

  if (!clientId || !publicId || !url) {
    throw new AppError('clientId, publicId, and url are required', 400);
  }

  const result = await savePhotoRecordService({
    studioId: req.auth.studioId,
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

export const savePhotoRecords = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.auth?.studioId) {
    throw new AppError('Unauthorized', 401);
  }

  if (!canManagePhotos(req)) {
    throw new AppError('Permission denied', 403);
  }

  const { clientId, photos } = req.body || {};
  if (!clientId || !Array.isArray(photos)) {
    throw new AppError('clientId and photos are required', 400);
  }

  const result = await savePhotoRecordsService({
    studioId: req.auth.studioId,
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

export const deletePhoto = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.auth?.studioId) {
    throw new AppError('Unauthorized', 401);
  }

  if (!canManagePhotos(req)) {
    throw new AppError('Forbidden', 403);
  }

  const result = await deletePhotoRecord({
    studioId: req.auth.studioId,
    photoId: req.params.id,
  });

  return success(res, result);
});

export const downloadPhoto = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const url = typeof req.query.url === 'string' ? req.query.url : undefined;
  if (!url) {
    throw new AppError('url is required', 400);
  }

  const filename = resolveDownloadFilename({
    filename: typeof req.query.filename === 'string' ? req.query.filename : undefined,
    url,
    publicId:
      typeof req.query.publicId === 'string'
        ? req.query.publicId
        : typeof req.query.public_id === 'string'
          ? req.query.public_id
          : undefined,
  });

  const stream = await fetchImageStream(url);
  if (!stream) {
    throw new AppError('File not found', 404);
  }

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const contentType = stream.headers['content-type'];
  if (contentType) {
    res.setHeader('Content-Type', Array.isArray(contentType) ? contentType[0] : contentType);
  }

  stream.pipe(res);
});

function resolveDownloadFilename({
  filename,
  url,
  publicId,
}: {
  filename?: string;
  url: string;
  publicId?: string;
}) {
  const direct = normalizeFilename(filename);
  if (direct) return direct;

  const fromUrl = normalizeFilename(extractFilenameFromUrl(url));
  if (fromUrl) return fromUrl;

  if (publicId) {
    return publicId.split('/').pop() || publicId;
  }

  return 'download.jpg';
}

function extractFilenameFromUrl(url: string) {
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
