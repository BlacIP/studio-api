import { Router } from 'express';
import { authMiddleware, requireStudio } from '../middleware/auth';
import {
  getUploadSignature,
  savePhotoRecord,
  savePhotoRecords,
  deletePhoto,
  downloadPhoto,
} from '../controllers/photos.controller';

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
 * /api/photos/save-records:
 *   post:
 *     summary: Save photo records after batch upload
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
 *               - photos
 *             properties:
 *               clientId:
 *                 type: string
 *                 format: uuid
 *               photos:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - publicId
 *                     - url
 *                   properties:
 *                     publicId:
 *                       type: string
 *                     url:
 *                       type: string
 *                     bytes:
 *                       type: number
 *                     width:
 *                       type: number
 *                     height:
 *                       type: number
 *                     format:
 *                       type: string
 *                     resourceType:
 *                       type: string
 *     responses:
 *       200:
 *         description: Photo records saved
 */
router.post('/photos/save-records', authMiddleware, requireStudio, savePhotoRecords);

/**
 * @openapi
 * /api/download:
 *   get:
 *     summary: Download a photo by URL
 *     tags: [Photos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: filename
 *         schema:
 *           type: string
 *       - in: query
 *         name: publicId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Photo download stream
 */
router.get('/download', authMiddleware, requireStudio, downloadPhoto);

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
