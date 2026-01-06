import { Router } from 'express';
import { getPublicStudioClients, getPublicStudioProfile } from '../../controllers/studios.controller';

const router = Router();

// Public studio profile for gallery/header usage
/**
 * @openapi
 * /api/studios/public/{slug}:
 *   get:
 *     summary: Get public studio profile
 *     tags: [Studios]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Public studio profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StudioPublic'
 *       404:
 *         description: Studio not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/public/:slug', getPublicStudioProfile);

/**
 * @openapi
 * /api/studios/public/{slug}/clients:
 *   get:
 *     summary: List public studio galleries
 *     tags: [Studios]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Public client list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StudioPublicClient'
 *       404:
 *         description: Studio not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/public/:slug/clients', getPublicStudioClients);

export default router;
