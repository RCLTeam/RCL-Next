import type { BridgeHealthResponse } from '@rcl/contracts';
import { type NextFunction, type Request, type Response, Router } from 'express';
import type { DiscordBridgeClient } from './discord-bridge.client.js';

export interface BridgeHealthChecker {
  checkHealth(): Promise<BridgeHealthResponse>;
}

export interface DiscordBridgeRouterOptions {
  bridgeClient: Pick<DiscordBridgeClient, 'checkHealth'> | BridgeHealthChecker;
}

export function createDiscordBridgeRouter(options: DiscordBridgeRouterOptions): Router {
  const { bridgeClient } = options;
  const router = Router();

  router.use((_req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const health = await bridgeClient.checkHealth();
      const statusCode = health.healthy ? 200 : 503;
      res.status(statusCode).json(health);
    } catch {
      const fallbackResponse: BridgeHealthResponse = {
        status: 'unreachable',
        healthy: false,
        message: 'No se puede llegar a él',
        details:
          'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
      };
      res.status(503).json(fallbackResponse);
    }
  });

  return router;
}
