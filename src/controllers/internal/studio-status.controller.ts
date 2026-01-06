import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { success } from '../../lib/http';
import {
  listStudioOwners as listStudioOwnersService,
  updateStudioStatus as updateStudioStatusService,
} from '../../services/internal/studio-status';

export const updateStudioStatus = asyncHandler(async (req: Request, res: Response) => {
  const result = await updateStudioStatusService(req.params.id, req.body?.status);
  return success(res, result);
});

export const listStudioOwners = asyncHandler(async (req: Request, res: Response) => {
  const result = await listStudioOwnersService(req.params.id);
  return success(res, result);
});
