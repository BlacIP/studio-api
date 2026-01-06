import { Router } from 'express';
import publicRoutes from './studios/public';
import meRoutes from './studios/me';

const router = Router();

router.use('/', publicRoutes);
router.use('/', meRoutes);

export default router;
