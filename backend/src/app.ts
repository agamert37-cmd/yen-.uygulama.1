import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { authGuard } from './middleware/authGuard';
import { errorHandler } from './middleware/errorHandler';
import { actionsRouter } from './routes/actions.routes';
import { healthRouter } from './routes/health.routes';
import { importRouter } from './routes/import.routes';
import { projectsRouter } from './routes/projects.routes';
import { logger } from './utils/logger';

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '2mb' }));

  // Health check is exempt from the auth guard so uptime probes don't need the token.
  app.use('/api/health', healthRouter);

  app.use('/api', authGuard);
  // Mounted before /api/projects so their more specific paths (e.g. POST
  // /api/projects/import/upload) aren't shadowed by projectsRouter's /:id.
  app.use('/api/projects/import', importRouter);
  app.use('/api/projects', actionsRouter);
  app.use('/api/projects', projectsRouter);

  // Serve the built frontend from the same origin/port in production. Routers
  // above already handled anything under /api, so this only ever sees page
  // requests; express.static no-ops (calls next()) until `npm run build -w
  // frontend` has produced frontend/dist.
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  app.use(errorHandler);

  return app;
}
