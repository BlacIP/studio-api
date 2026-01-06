import { Router } from 'express';
import { internalAuth } from '../middleware/internal';
import { cronAuth } from '../middleware/cron';
import {
  listStudioOwners,
  updateStudioStatus,
} from '../controllers/internal/studio-status.controller';
import {
  createLegacyClient,
  deleteLegacyClient,
  getLegacyClient,
  listLegacyClients,
  updateLegacyClient,
} from '../controllers/internal/legacy-clients.controller';
import {
  deleteLegacyPhoto,
  getLegacyUploadSignature,
  saveLegacyPhotoRecord,
  saveLegacyPhotoRecords,
} from '../controllers/internal/legacy-photos.controller';
import {
  getOutboxStatus,
  processOutbox,
  processOutboxIfNeeded,
} from '../controllers/internal/outbox.controller';
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
router.post('/legacy/photos/save-records', internalAuth, saveLegacyPhotoRecords);
router.delete('/legacy/photos/:id', internalAuth, deleteLegacyPhoto);
router.get('/legacy/gallery/:slug', internalAuth, getGalleryBySlug);
router.post('/outbox/process', cronAuth, processOutbox);
router.get('/outbox/process', cronAuth, processOutbox);
router.post('/outbox/process-if-needed', cronAuth, processOutboxIfNeeded);
router.get('/outbox/process-if-needed', cronAuth, processOutboxIfNeeded);
router.get('/outbox/status', cronAuth, getOutboxStatus);

export default router;
