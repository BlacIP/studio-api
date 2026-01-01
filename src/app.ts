import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === 'true';
  const normalizeOrigin = (value: string) => value.replace(/\/$/, '');
  const toOrigin = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (!/^https?:\/\//.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  };

  const allowedOrigins = new Set<string>();
  const originEnv = process.env.CORS_ALLOWED_ORIGINS || process.env.STUDIO_APP_URL || '';
  [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
    process.env.PUBLIC_API_URL,
    process.env.PRODUCTION_URL,
    process.env.VERCEL_URL,
    ...originEnv.split(','),
  ]
    .filter(Boolean)
    .map((value) => toOrigin(String(value)))
    .filter(Boolean)
    .forEach((value) => allowedOrigins.add(normalizeOrigin(value)));

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) {
        return cb(null, true);
      }

      const normalized = normalizeOrigin(origin);
      if (allowedOrigins.has(normalized)) {
        return cb(null, true);
      }

      if (allowVercelPreviews && normalized.endsWith('.vercel.app')) {
        return cb(null, true);
      }

      if (process.env.NODE_ENV === 'production') {
        return cb(new Error('Not allowed by CORS'));
      }

      return cb(null, true);
    },
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(outboxFlushMiddleware);

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  app.use('/api', generalLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    if (req.headers['x-admin-sync-secret']) {
      return next();
    }

    let origin = req.headers.origin as string | undefined;
    if (!origin && req.headers.referer) {
      try {
        origin = new URL(req.headers.referer).origin;
      } catch {
        origin = undefined;
      }
    }

    if (!origin) {
      return next();
    }

    const normalized = normalizeOrigin(origin);
    if (allowedOrigins.has(normalized)) {
      return next();
    }

    if (allowVercelPreviews && normalized.endsWith('.vercel.app')) {
      return next();
    }

    res.status(403).json({ error: 'Forbidden - CSRF protection' });
  });

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

  const enableSwagger = process.env.ENABLE_SWAGGER === 'true' || process.env.NODE_ENV !== 'production';
  const swaggerSpec = getSwaggerSpec();
  if (enableSwagger) {
    app.get('/openapi.json', (_req, res) => {
      res.json(swaggerSpec);
    });
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  }

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
