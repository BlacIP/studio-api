import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { getStudioLogoUploadSignature, getStudioMe, updateStudioMe } from '../../controllers/studios.controller';

const router = Router();

// Return the current studio info for the logged-in user
/**
 * @openapi
 * /api/studios/me:
 *   get:
 *     summary: Get current studio
 *     tags: [Studios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Studio details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Studio'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Studio scope required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Studio not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me', authMiddleware, getStudioMe);

/**
 * @openapi
 * /api/studios/me:
 *   patch:
 *     summary: Update studio onboarding details
 *     tags: [Studios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StudioOnboardingRequest'
 *     responses:
 *       200:
 *         description: Studio updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Studio'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Studio scope required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Slug already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/me', authMiddleware, updateStudioMe);

/**
 * @openapi
 * /api/studios/logo/upload-signature:
 *   post:
 *     summary: Get studio logo upload signature
 *     tags: [Studios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Upload signature generated
 *       401:
 *         description: Unauthorized
 */
router.post('/logo/upload-signature', authMiddleware, getStudioLogoUploadSignature);

export default router;
