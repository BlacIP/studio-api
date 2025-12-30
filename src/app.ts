import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import studioRoutes from './routes/studios';
import clientRoutes from './routes/clients';

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

  app.use('/api/auth', authRoutes);
  app.use('/api/studios', studioRoutes);
  app.use('/api/clients', clientRoutes);

  // TODO: add studio-scoped client/photo/galleries routes (copied/refined from photolibrary-api)

  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
