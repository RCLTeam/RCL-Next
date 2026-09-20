import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { type AuthOptions, authRouter } from './modules/auth/auth.router.js';
import { CompetitionController } from './modules/competition/competition.controller.js';
import type { CompetitionRepository } from './modules/competition/competition.repository.js';
import { competitionRouter } from './modules/competition/competition.router.js';
import { CompetitionService } from './modules/competition/competition.service.js';
import type { CrudOperationsRepository } from './modules/crud-operations/crud-operations.repository.js';
import { crudOperationsRouter } from './modules/crud-operations/crud-operations.router.js';
import { CrudOperationsService } from './modules/crud-operations/crud-operations.service.js';
import { errorHandler } from './shared/http.js';

export function createApp(options: {
  repository: CompetitionRepository;
  checkDatabase: () => Promise<void>;
  corsOrigin: string;
  auth?: AuthOptions;
  crudOperationsRepository?: CrudOperationsRepository;
}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: options.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  if (options.auth && options.crudOperationsRepository) {
    app.use(
      '/api/v1/crud-operations',
      crudOperationsRouter(
        new CrudOperationsService(options.crudOperationsRepository),
        options.auth
      )
    );
  } else {
    app.use('/api/v1/crud-operations', (_req, res) =>
      res.status(503).json({
        error: {
          code: 'CRUD_OPERATIONS_NOT_CONFIGURED',
          message: 'CRUD operations are not configured.'
        }
      })
    );
  }
  if (options.auth) {
    app.use('/api/v1/auth', authRouter(options.auth));
  } else {
    app.use('/api/v1/auth', (_req, res) => {
      res.status(503).json({
        error: { code: 'AUTH_NOT_CONFIGURED', message: 'Discord sign-in is not configured.' }
      });
    });
  }
  app.get('/health/live', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });
  app.get('/health/ready', async (_req, res) => {
    try {
      await options.checkDatabase();
      res.json({ data: { status: 'ready', database: 'connected' } });
    } catch {
      res
        .status(503)
        .json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is not ready.' } });
    }
  });
  app.use(
    '/api/v1',
    competitionRouter(new CompetitionController(new CompetitionService(options.repository)))
  );
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });
  app.use(errorHandler);
  return app;
}
