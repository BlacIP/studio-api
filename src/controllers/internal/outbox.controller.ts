import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { success } from '../../lib/http';
import {
  getOutboxStatus as getOutboxStatusService,
  processOutbox as processOutboxService,
  processOutboxIfNeeded as processOutboxIfNeededService,
} from '../../services/internal/outbox';

export const processOutbox = asyncHandler(async (_req: Request, res: Response) => {
  const result = await processOutboxService();
  return success(res, result);
});

export const processOutboxIfNeeded = asyncHandler(async (_req: Request, res: Response) => {
  const result = await processOutboxIfNeededService();
  return success(res, result);
});

export const getOutboxStatus = asyncHandler(async (_req: Request, res: Response) => {
  const result = await getOutboxStatusService();
  return success(res, result);
});
