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

export function createApp(): Application {
  const app = express();

  app.use(cors({
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
