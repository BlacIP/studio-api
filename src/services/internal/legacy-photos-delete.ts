import { pool } from '../../lib/db';
import cloudinary from '../../lib/cloudinary';
import { syncClientStatsToAdmin } from '../../lib/admin-sync';
import { AppError } from '../../lib/errors';
import { getLegacyStudio } from './legacy-studio';

export async function deleteLegacyPhoto(id: string) {
  const legacyStudio = await getLegacyStudio();

  const photoResult = await pool.query(
    `SELECT p.public_id, p.client_id, p.size
     FROM photos p
     JOIN clients c ON c.id = p.client_id
     WHERE p.id = $1 AND c.studio_id = $2`,
    [id, legacyStudio.id]
  );
  if (photoResult.rows.length === 0) {
    throw new AppError('Photo not found', 404);
  }

  const { public_id: publicId, client_id: clientId, size } = photoResult.rows[0];
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error(`Failed to delete Cloudinary image: ${publicId}`, err);
  }

  await pool.query('DELETE FROM photos WHERE id = $1', [id]);
  await syncClientStatsToAdmin({
    studioId: legacyStudio.id,
    clientId,
    deltaCount: -1,
    deltaBytes: size ? -Number(size) : 0,
  });

  return { success: true };
}
