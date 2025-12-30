import { Router } from 'express';
import { internalAuth } from '../middleware/internal';
import {
  createLegacyClient,
  deleteLegacyClient,
  deleteLegacyPhoto,
  getLegacyClient,
  getLegacyUploadSignature,
  listLegacyClients,
  listStudioOwners,
  saveLegacyPhotoRecord,
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

export default router;
