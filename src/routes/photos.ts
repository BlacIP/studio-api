import { Router } from 'express';
import { authMiddleware, requireStudio } from '../middleware/auth';
import { getUploadSignature, savePhotoRecord, deletePhoto } from '../controllers/photos.controller';

const router = Router();

/**
 * @openapi
 * /api/photos/upload-signature:
 *   post:
 *     summary: Get Cloudinary upload signature
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clientId
 *             properties:
 *               clientId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Upload signature generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timestamp:
 *                   type: number
 *                 signature:
 *                   type: string
 *                 folder:
 *                   type: string
 *                 cloudName:
 *                   type: string
 *                 apiKey:
 *                   type: string
 */
router.post('/photos/upload-signature', authMiddleware, requireStudio, getUploadSignature);

/**
 * @openapi
 * /api/photos/save-record:
 *   post:
 *     summary: Save photo record after upload
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PhotoSaveRequest'
 *     responses:
 *       200:
 *         description: Photo record saved
 */
router.post('/photos/save-record', authMiddleware, requireStudio, savePhotoRecord);

/**
 * @openapi
 * /api/photos/{id}:
 *   delete:
 *     summary: Delete photo
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Photo deleted
 */
router.delete('/photos/:id', authMiddleware, requireStudio, deletePhoto);

export default router;
