import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './routes/auth';
import studioRoutes from './routes/studios';
import clientRoutes from './routes/clients';
import photoRoutes from './routes/photos';
import galleryRoutes from './routes/gallery';
import internalRoutes from './routes/internal';
import { getSwaggerSpec } from './swagger';
import { outboxFlushMiddleware } from './middleware/outbox';
import { pool } from './lib/db';
import { refreshOutboxStatus } from './lib/outbox';

export function createApp(): Application {
  const app = express();

  app.use(cors({
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(outboxFlushMiddleware);

  const enableRequestLogging =
    process.env.REQUEST_LOGS === 'true' || process.env.NODE_ENV !== 'production';
  if (enableRequestLogging) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - start;
        const auth = (req as any).auth;
        const actor = auth
          ? ` user=${auth.userId} studio=${auth.studioId} role=${auth.role}`
          : '';
        console.log(`[${res.statusCode}] ${req.method} ${req.originalUrl} ${ms}ms${actor}`);
      });
      next();
    });
  }

  app.get('/health', async (_req, res) => {
    const payload: {
      status: 'ok';
      timestamp: string;
      outbox?: {
        status: string;
        pending_count?: number;
        last_degraded_at?: string | null;
        last_recovered_at?: string | null;
      };
    } = { status: 'ok', timestamp: new Date().toISOString() };

    try {
      await refreshOutboxStatus();
      const statusRes = await pool.query(
        `SELECT status, pending_count, last_degraded_at, last_recovered_at
         FROM sync_outbox_status
         WHERE id = 1`
      );
      if (statusRes.rows.length > 0) {
        const row = statusRes.rows[0];
        payload.outbox = {
          status: row.status,
          pending_count: row.pending_count,
          last_degraded_at: row.last_degraded_at,
          last_recovered_at: row.last_recovered_at,
        };
      } else {
        payload.outbox = { status: 'unknown' };
      }
    } catch (error) {
      payload.outbox = { status: 'unknown' };
      console.error('Health outbox status error', error);
    }

    res.json(payload);
  });

  const swaggerSpec = getSwaggerSpec();
  app.get('/openapi.json', (_req, res) => {
    res.json(swaggerSpec);
  });
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use('/api/auth', authRoutes);
  app.use('/api/studios', studioRoutes);
  app.use('/api/clients', clientRoutes);
  app.use('/api', photoRoutes);
  app.use('/api', galleryRoutes);
  app.use('/api/internal', internalRoutes);

  // TODO: add studio-scoped client/photo/galleries routes (copied/refined from photolibrary-api)

  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export default createApp();
