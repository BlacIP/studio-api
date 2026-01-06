import { Router } from 'express';
import collectionRoutes from './clients/collection';
import itemRoutes from './clients/item';

const router = Router();

router.use('/', collectionRoutes);
router.use('/', itemRoutes);

export default router;
