import { Router } from 'express';
import { internalAuth } from '../middleware/internal';
import { listStudioOwners, updateStudioStatus } from '../controllers/internal.controller';

const router = Router();

router.patch('/studios/:id/status', internalAuth, updateStudioStatus);
router.get('/studios/:id/owners', internalAuth, listStudioOwners);

export default router;
