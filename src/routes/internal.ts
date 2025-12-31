import { Router } from 'express';
import { internalAuth } from '../middleware/internal';
import { cronAuth } from '../middleware/cron';
import {
  createLegacyClient,
  deleteLegacyClient,
  deleteLegacyPhoto,
  getLegacyClient,
  getLegacyUploadSignature,
  listLegacyClients,
  listStudioOwners,
  saveLegacyPhotoRecord,
  getOutboxStatus,
  processOutbox,
  processOutboxIfNeeded,
  updateLegacyClient,
  updateStudioStatus,
} from '../controllers/internal.controller';
import { getGalleryBySlug } from '../controllers/gallery.controller';

const router = Router();

router.patch('/studios/:id/status', internalAuth, updateStudioStatus);
router.get('/studios/:id/owners', internalAuth, listStudioOwners);
router.get('/legacy/clients', internalAuth, listLegacyClients);
router.post('/legacy/clients', internalAuth, createLegacyClient);
router.get('/legacy/clients/:id', internalAuth, getLegacyClient);
router.put('/legacy/clients/:id', internalAuth, updateLegacyClient);
router.delete('/legacy/clients/:id', internalAuth, deleteLegacyClient);
router.post('/legacy/photos/upload-signature', internalAuth, getLegacyUploadSignature);
router.post('/legacy/photos/save-record', internalAuth, saveLegacyPhotoRecord);
router.delete('/legacy/photos/:id', internalAuth, deleteLegacyPhoto);
router.get('/legacy/gallery/:slug', internalAuth, getGalleryBySlug);
router.post('/outbox/process', cronAuth, processOutbox);
router.get('/outbox/process', cronAuth, processOutbox);
router.post('/outbox/process-if-needed', cronAuth, processOutboxIfNeeded);
router.get('/outbox/process-if-needed', cronAuth, processOutboxIfNeeded);
router.get('/outbox/status', cronAuth, getOutboxStatus);

export default router;
