import { Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { AuthedRequest } from '../middleware/auth';
import { AppError } from '../lib/errors';
import { success } from '../lib/http';
import {
  createClient as createClientService,
  deleteClient as deleteClientService,
  getClientDetails,
  listClients,
  updateClient as updateClientService,
} from '../services/clients';

function canManageClients(req: AuthedRequest) {
  const role = req.auth?.role;
  const perms = req.auth?.permissions || [];
  return role === 'OWNER' || role === 'ADMIN' || perms.includes('manage_clients');
}

export const listStudioClients = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const result = await listClients(req.auth!.studioId);
  return success(res, result);
});

export const createStudioClient = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!canManageClients(req)) {
    throw new AppError('Forbidden', 403);
  }

  const { name, subheading = null, event_date, date } = req.body;
  const eventDate = event_date || date;
  if (!name || !eventDate) {
    throw new AppError('Name and event_date are required', 400);
  }

  const client = await createClientService({
    studioId: req.auth!.studioId,
    name,
    subheading,
    eventDate,
  });

  return success(res, client, 201);
});

export const getStudioClient = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const result = await getClientDetails(req.auth!.studioId, req.params.id);
  return success(res, result);
});

export const updateStudioClient = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!canManageClients(req)) {
    throw new AppError('Forbidden', 403);
  }

  const result = await updateClientService(req.auth!.studioId, req.params.id, req.body || {});
  return success(res, result);
});

export const deleteStudioClient = asyncHandler(async (req: AuthedRequest, res: Response) => {
  if (!canManageClients(req)) {
    throw new AppError('Forbidden', 403);
  }

  const result = await deleteClientService(req.auth!.studioId, req.params.id);
  return success(res, result);
});
