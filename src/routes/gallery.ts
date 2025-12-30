import { Router } from 'express';
import { getGallery, downloadGallery, getGalleryBySlug, downloadGalleryBySlug } from '../controllers/gallery.controller';

const router = Router();

/**
 * @openapi
 * /api/gallery/{studioSlug}/{clientSlug}:
 *   get:
 *     summary: Get public gallery
 *     tags: [Gallery]
 *     parameters:
 *       - in: path
 *         name: studioSlug
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: clientSlug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Gallery data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GalleryResponse'
 */
router.get('/gallery/:studioSlug/:clientSlug', getGallery);

/**
 * @openapi
 * /api/gallery/{studioSlug}/{clientSlug}/download:
 *   get:
 *     summary: Download zip of gallery
 *     tags: [Gallery]
 *     parameters:
 *       - in: path
 *         name: studioSlug
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: clientSlug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Zip download
 */
router.get('/gallery/:studioSlug/:clientSlug/download', downloadGallery);

/**
 * @openapi
 * /api/gallery/{slug}:
 *   get:
 *     summary: Get public gallery by legacy slug
 *     tags: [Gallery]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Gallery data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GalleryResponse'
 *       409:
 *         description: Ambiguous slug
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/gallery/:slug', getGalleryBySlug);

/**
 * @openapi
 * /api/gallery/{slug}/download:
 *   get:
 *     summary: Download zip of gallery by legacy slug
 *     tags: [Gallery]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Zip download
 *       409:
 *         description: Ambiguous slug
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/gallery/:slug/download', downloadGalleryBySlug);

export default router;
