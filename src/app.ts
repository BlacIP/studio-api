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
import { errorHandler } from './middleware/error-handler';
import { createCorsConfig } from './lib/cors';
import { healthHandler } from './lib/health';

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

  const { corsOptions, allowedOrigins, normalizeOrigin, allowVercelPreviews } = createCorsConfig();
  app.use(cors(corsOptions));
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
        const auth = (req as {
          auth?: { userId?: string; studioId?: string; role?: string };
        }).auth;
        const actor = auth
          ? ` user=${auth.userId} studio=${auth.studioId} role=${auth.role}`
          : '';
        console.log(`[${res.statusCode}] ${req.method} ${req.originalUrl} ${ms}ms${actor}`);
      });
      next();
    });
  }

  app.get('/health', healthHandler);

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

  app.use(errorHandler);

  return app;
}

export default createApp();
