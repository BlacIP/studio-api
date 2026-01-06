import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { AppError } from '../lib/errors';
import { success } from '../lib/http';
import {
  getPublicStudioClients as getPublicStudioClientsService,
  getPublicStudioProfile as getPublicStudioProfileService,
} from '../services/studios/studio-public';
import { getStudioMe as getStudioMeService, updateStudioMe as updateStudioMeService } from '../services/studios/studio-me';
import { getStudioLogoUploadSignature as getStudioLogoUploadSignatureService } from '../services/studios/studio-logo';

type AuthedRequest = Request & { auth?: { studioId?: string } };

export const getPublicStudioProfile = asyncHandler(async (req: Request, res: Response) => {
  const result = await getPublicStudioProfileService(req.params.slug);
  return success(res, result);
});

export const getPublicStudioClients = asyncHandler(async (req: Request, res: Response) => {
  const result = await getPublicStudioClientsService(req.params.slug);
  return success(res, result);
});

export const getStudioMe = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const studioId = req.auth?.studioId;
  if (!studioId) {
    throw new AppError('Studio scope required', 403);
  }

  const result = await getStudioMeService(studioId);
  return success(res, result);
});

export const updateStudioMe = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const studioId = req.auth?.studioId;
  if (!studioId) {
    throw new AppError('Studio scope required', 403);
  }

  const { name } = req.body || {};
  if (!name) {
    throw new AppError('name is required', 400);
  }

  const result = await updateStudioMeService({ studioId, ...req.body });
  return success(res, result);
});

export const getStudioLogoUploadSignature = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!req.auth?.studioId) {
    throw new AppError('Unauthorized', 401);
  }

  const result = await getStudioLogoUploadSignatureService(req.auth.studioId);
  return success(res, result);
});
