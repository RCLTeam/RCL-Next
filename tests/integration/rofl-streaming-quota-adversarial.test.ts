import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { RoflUploadRepository } from '../../apps/api/src/modules/rofl-upload/persistence/rofl-upload.repository.js';
import { attachRoflUploadGateway } from '../../apps/api/src/modules/rofl-upload/websocket/rofl-upload.gateway.js';

describe('Streaming Chunk Accumulator Quota Adversarial Tests', () => {
  let server: http.Server;
  let port: number;

  const stubRepo: RoflUploadRepository = {
    findPlayersByRiotIds: async () => [],
    checkExternalGamesExist: async () => [],
    findTeamMembershipsForDiscordUsers: async () => new Map(),
    findMatchForTeams: async () => null,
    executeBatchInsert: async () => ({ insertedGames: 0, skippedDuplicates: [] })
  };

  beforeAll(async () => {
    server = http.createServer();
    attachRoflUploadGateway(server, stubRepo);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    server.close();
  });

  it('aborts upload and sends error event when streamed binary bytes exceed 50MB limit', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    // Send start payload
    ws.send(JSON.stringify({ type: 'start', filename: 'match.rofl' }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Send chunks exceeding 50MB (6 x 10MB = 60MB)
    const chunk = Buffer.alloc(10 * 1024 * 1024, 1);
    let receivedError: string | null = null;
    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'error') {
          receivedError = parsed.message;
        }
      } catch {
        // ignore non-json messages
      }
    });

    for (let i = 0; i < 6; i++) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk);
      }
    }

    const closeEvent = await new Promise<{ code: number }>((resolve) => {
      ws.on('close', (code) => resolve({ code }));
    });

    expect(closeEvent.code).toBe(1009);
    expect(receivedError).toMatch(/exceeds maximum upload size/i);
  });

  it('does not reset byte accumulator on mid-stream start messages and terminates connection when cumulative payload exceeds 50MB', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/rofl-upload`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    let receivedError: string | null = null;
    const errors: string[] = [];
    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'error') {
          receivedError = parsed.message;
          errors.push(parsed.message);
        }
      } catch {
        // ignore non-json messages
      }
    });

    // 1. Initial valid start payload
    await new Promise<void>((resolve) => {
      const onStarted = (data: unknown) => {
        try {
          const parsed = JSON.parse(String(data));
          if (parsed.type === 'started') {
            ws.off('message', onStarted);
            resolve();
          }
        } catch {
          // ignore non-json messages
        }
      };
      ws.on('message', onStarted);
      ws.send(JSON.stringify({ type: 'start', filename: 'legit.rofl' }));
      setTimeout(resolve, 500);
    });

    // 2. Stream 30MB (3 x 10MB chunks). Well within 50MB quota.
    const chunk = Buffer.alloc(10 * 1024 * 1024, 1);
    for (let i = 0; i < 3; i++) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 3. Attacker sends a rogue mid-stream start message attempting to reset receivedBytes accumulator
    ws.send(JSON.stringify({ type: 'start', filename: 'rogue-reset.rofl' }));
    await new Promise<void>((resolve) => {
      const check = () => {
        if (errors.includes('Upload already in progress')) {
          resolve();
          return;
        }
        setTimeout(check, 20);
      };
      check();
      setTimeout(resolve, 2000);
    });

    // Verify the server rejected the mid-stream start
    expect(errors).toContain('Upload already in progress');

    // 4. Send another 30MB (3 x 10MB chunks).
    // If accumulator was reset on rogue start, total would only appear as 30MB and connection would remain open.
    // If accumulator was preserved, cumulative is 60MB (> 50MB), which must trigger code 1009 closure.
    for (let i = 0; i < 3; i++) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk);
      }
    }

    const closeEvent = await new Promise<{ code: number }>((resolve) => {
      ws.on('close', (code) => resolve({ code }));
    });

    expect(closeEvent.code).toBe(1009);
    expect(receivedError).toMatch(/exceeds maximum upload size/i);
  });
});
