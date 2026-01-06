import { Router } from 'express';
import { authMiddleware, requireStudio } from '../../middleware/auth';
import { deleteStudioClient, getStudioClient, updateStudioClient } from '../../controllers/clients.controller';

const router = Router();

/**
 * @openapi
 * /api/clients/{id}:
 *   get:
 *     summary: Get client by ID
 *     tags: [Clients]
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
 *         description: Client details with photos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 client:
 *                   $ref: '#/components/schemas/Client'
 *                 photos:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Photo'
 *       404:
 *         description: Client not found
 */
router.get('/:id', authMiddleware, requireStudio, getStudioClient);

/**
 * @openapi
 * /api/clients/{id}:
 *   put:
 *     summary: Update client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClientUpdateRequest'
 *     responses:
 *       200:
 *         description: Client updated
 *       403:
 *         description: Forbidden
 */
router.put('/:id', authMiddleware, requireStudio, updateStudioClient);

/**
 * @openapi
 * /api/clients/{id}:
 *   delete:
 *     summary: Delete client
 *     tags: [Clients]
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
 *         description: Client deleted
 *       403:
 *         description: Forbidden
 */
router.delete('/:id', authMiddleware, requireStudio, deleteStudioClient);

export default router;
