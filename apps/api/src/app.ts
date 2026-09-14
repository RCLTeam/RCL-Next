import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { CompetitionRepository } from './modules/competition/competition.repository.js';
import { CompetitionService } from './modules/competition/competition.service.js';
import { CompetitionController } from './modules/competition/competition.controller.js';
import { competitionRouter } from './modules/competition/competition.router.js';
import { errorHandler } from './shared/http.js';

export function createApp(options: {
  repository: CompetitionRepository; checkDatabase: () => Promise<void>; corsOrigin: string;
}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: options.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.get('/health/live', (_req, res) => { res.json({ data: { status: 'ok' } }); });
  app.get('/health/ready', async (_req, res) => {
    try {
      await options.checkDatabase();
      res.json({ data: { status: 'ready', database: 'connected' } });
    } catch {
      res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is not ready.' } });
    }
  });
  app.use('/api/v1', competitionRouter(new CompetitionController(new CompetitionService(options.repository))));
  app.use((_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }); });
  app.use(errorHandler);
  return app;
}
