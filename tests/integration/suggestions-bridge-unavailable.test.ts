import net from 'node:net';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import type { CompetitionRepository } from '../../apps/api/src/modules/competition/competition.repository.js';
import { DiscordBridgeClient } from '../../apps/api/src/modules/discord-bridge/discord-bridge.client.js';
import { IncidentLogger } from '../../apps/api/src/modules/suggestions/incident-logger.js';
import { SuggestionStore } from '../../apps/api/src/modules/suggestions/suggestion.store.js';
import { SuggestionsService } from '../../apps/api/src/modules/suggestions/suggestions.service.js';

const frontendOrigin = 'http://localhost:5173';

/** Returns a local port with nothing listening on it. */
async function closedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe('Suggestions with the Discord bot unavailable', () => {
  const processErrors: unknown[] = [];
  const onProcessError = (reason: unknown) => {
    processErrors.push(reason);
  };
  const clients: DiscordBridgeClient[] = [];
  const stores: SuggestionStore[] = [];

  beforeEach(() => {
    processErrors.length = 0;
    process.on('unhandledRejection', onProcessError);
    process.on('uncaughtException', onProcessError);
  });

  afterEach(async () => {
    process.removeListener('unhandledRejection', onProcessError);
    process.removeListener('uncaughtException', onProcessError);
    for (const client of clients.splice(0)) await client.close();
    for (const store of stores.splice(0)) store.close();
  });

  function buildApp(wsUrl: string, logLines: string[]) {
    const bridgeClient = new DiscordBridgeClient({
      wsUrl,
      supertoken: 'test-supertoken',
      connectTimeoutMs: 2000
    });
    const suggestionStore = new SuggestionStore({ enablePeriodicCleanup: false });
    const incidentLogger = new IncidentLogger((line) => logLines.push(line));
    clients.push(bridgeClient);
    stores.push(suggestionStore);
    const app = createApp({
      repository: {} as CompetitionRepository,
      checkDatabase: async () => {},
      corsOrigin: frontendOrigin,
      bridgeClient,
      suggestionStore,
      incidentLogger,
      suggestionsService: new SuggestionsService({
        store: suggestionStore,
        bridgeClient,
        logger: incidentLogger
      })
    });
    return { app, suggestionStore };
  }

  it('marks the suggestion as failed without exposing connection details or ending the process', async () => {
    const port = await closedPort();
    const logLines: string[] = [];
    const { app } = buildApp(`ws://127.0.0.1:${port}/ws/bridge`, logLines);

    const created = await request(app)
      .post('/api/v1/suggestions')
      .set('Origin', frontendOrigin)
      .send({ suggestion: 'Sugerencia enviada con el bot detenido', isAnonymous: true });
    expect(created.status).toBe(202);

    let status: request.Response | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      status = await request(app).get(`/api/v1/suggestions/status/${created.body.id}`);
      if (status.body.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(status?.status).toBe(200);
    expect(status?.body.status).toBe('failed');
    expect(typeof status?.body.incidentId).toBe('string');
    expect(status?.body.error).toBeUndefined();
    expect(JSON.stringify(status?.body)).not.toContain(String(port));
    expect(JSON.stringify(status?.body)).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/);

    const incidentLine = logLines.find((line) => line.includes(status?.body.incidentId));
    expect(incidentLine).toContain('ECONNREFUSED');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(processErrors).toEqual([]);
  });

  it('responds 503 SUGGESTIONS_NOT_CONFIGURED without queueing when the bridge URL is empty', async () => {
    const { app, suggestionStore } = buildApp('', []);

    const res = await request(app)
      .post('/api/v1/suggestions')
      .set('Origin', frontendOrigin)
      .send({ suggestion: 'Sugerencia sin puente configurado', isAnonymous: true });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SUGGESTIONS_NOT_CONFIGURED');
    expect(suggestionStore.size()).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(processErrors).toEqual([]);
  });
});
