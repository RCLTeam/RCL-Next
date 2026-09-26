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
import type { DatabaseTransferRepository } from './modules/database-transfer/database-transfer.repository.js';
import { databaseTransferRouter } from './modules/database-transfer/database-transfer.router.js';
import { DatabaseTransferService } from './modules/database-transfer/database-transfer.service.js';
import { DiscordBridgeClient } from './modules/discord-bridge/discord-bridge.client.js';
import { createDiscordBridgeRouter } from './modules/discord-bridge/discord-bridge.router.js';
import type { HomeContentRepository } from './modules/home-content/home-content.repository.js';
import { homeContentRouter } from './modules/home-content/home-content.router.js';
import { HomeContentService } from './modules/home-content/home-content.service.js';
import type { MemberRolesRepository } from './modules/member-roles/member-roles.repository.js';
import { memberRolesRouter } from './modules/member-roles/member-roles.router.js';
import { MemberRolesService } from './modules/member-roles/member-roles.service.js';
import { IncidentLogger } from './modules/suggestions/incident-logger.js';
import { SuggestionStore } from './modules/suggestions/suggestion.store.js';
import { createSuggestionsRouter } from './modules/suggestions/suggestions.router.js';
import { SuggestionsService } from './modules/suggestions/suggestions.service.js';
import { errorHandler } from './shared/http.js';

export function createApp(options: {
  repository: CompetitionRepository;
  checkDatabase: () => Promise<void>;
  corsOrigin: string;
  auth?: AuthOptions;
  crudOperationsRepository?: CrudOperationsRepository;
  memberRolesRepository?: MemberRolesRepository;
  databaseTransferRepository?: DatabaseTransferRepository;
  homeContentRepository?: HomeContentRepository;
  bridgeClient?: DiscordBridgeClient;
  suggestionsService?: SuggestionsService;
  suggestionStore?: SuggestionStore;
  incidentLogger?: IncidentLogger;
}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: options.corsOrigin, credentials: true }));
  if (options.auth && options.databaseTransferRepository) {
    app.use(
      '/api/v1/database-transfer',
      databaseTransferRouter(
        new DatabaseTransferService(options.databaseTransferRepository),
        options.auth
      )
    );
  } else {
    app.use('/api/v1/database-transfer', (_req, res) =>
      res.status(503).json({
        error: {
          code: 'DATABASE_TRANSFER_NOT_CONFIGURED',
          message: 'Database transfer is not configured.'
        }
      })
    );
  }
  app.use(express.json({ limit: '1mb' }));
  if (options.homeContentRepository) {
    app.use(
      '/api/v1/home-content',
      homeContentRouter(new HomeContentService(options.homeContentRepository), options.auth)
    );
  }
  if (options.auth && options.memberRolesRepository) {
    app.use(
      '/api/v1/member-roles',
      memberRolesRouter(new MemberRolesService(options.memberRolesRepository), options.auth)
    );
  } else {
    app.use('/api/v1/member-roles', (_req, res) =>
      res.status(503).json({
        error: {
          code: 'MEMBER_ROLES_NOT_CONFIGURED',
          message: 'Member roles are not configured.'
        }
      })
    );
  }
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
  const bridgeClient =
    options.bridgeClient ??
    new DiscordBridgeClient({
      wsUrl: process.env.DISCORD_BOT_WS_URL ?? '',
      supertoken: process.env.DISCORD_BOT_WS_SUPERTOKEN ?? ''
    });
  const incidentLogger = options.incidentLogger ?? new IncidentLogger();
  const suggestionStore = options.suggestionStore ?? new SuggestionStore();
  const suggestionsService =
    options.suggestionsService ??
    new SuggestionsService({
      store: suggestionStore,
      bridgeClient,
      logger: incidentLogger
    });
  app.use('/api/v1/bridge', createDiscordBridgeRouter(bridgeClient));
  app.use(
    '/api/v1/suggestions',
    createSuggestionsRouter({
      suggestionsService,
      frontendOrigin: options.corsOrigin,
      auth: options.auth
    })
  );
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
