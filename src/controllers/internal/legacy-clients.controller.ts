import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/async-handler';
import { AppError } from '../../lib/errors';
import { success } from '../../lib/http';
import {
  createLegacyClient as createLegacyClientService,
  deleteLegacyClient as deleteLegacyClientService,
  getLegacyClient as getLegacyClientService,
  listLegacyClients as listLegacyClientsService,
  updateLegacyClient as updateLegacyClientService,
} from '../../services/internal/legacy-clients';

export const listLegacyClients = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await listLegacyClientsService();
  return success(res, rows);
});

export const createLegacyClient = asyncHandler(async (req: Request, res: Response) => {
  const { name, subheading = null, event_date, date } = req.body || {};
  const eventDate = event_date || date;

  if (!name || !eventDate) {
    throw new AppError('Name and event_date are required', 400);
  }

  const client = await createLegacyClientService({
    name,
    subheading,
    eventDate,
  });

  return success(res, client, 201);
});

export const getLegacyClient = asyncHandler(async (req: Request, res: Response) => {
  const result = await getLegacyClientService(req.params.id);
  return success(res, result);
});

export const updateLegacyClient = asyncHandler(async (req: Request, res: Response) => {
  const result = await updateLegacyClientService(req.params.id, req.body || {});
  return success(res, result);
});

export const deleteLegacyClient = asyncHandler(async (req: Request, res: Response) => {
  const result = await deleteLegacyClientService(req.params.id);
  return success(res, result);
});
