import { EventEmitter } from 'node:events';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { BridgeRateLimitTimeoutError, DiscordBridgeClient } from './discord-bridge.client.js';
import {
  type BridgeHealthChecker,
  createDiscordBridgeRouter,
  discordBridgeRouter
} from './discord-bridge.router.js';

interface MockSentFrame {
  type: string;
  data: {
    id: string;
    supertoken?: string;
    code?: string;
    retry_after_seconds?: number;
    message?: string;
    status?: string;
    [key: string]: unknown;
  };
}

class MockWebSocket extends EventEmitter {
  public readyState = 0; // 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
  public sentFrames: string[] = [];
  public closeCode: number | null = null;
  public closeReason: string | null = null;

  public static OPEN = 1;
  public static CLOSED = 3;

  public send(data: string): void {
    this.sentFrames.push(data);
  }

  public close(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.closeCode = code;
    this.closeReason = reason;
    this.emit('close', code, Buffer.from(reason));
    this.flushTicks();
  }

  public terminate(): void {
    this.close(1006, 'Abnormal closure');
  }

  public triggerOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit('open');
    this.flushTicks();
  }

  public triggerMessage(payload: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(payload)));
    this.flushTicks();
  }

  public triggerError(err: Error): void {
    this.emit('error', err);
    this.flushTicks();
  }

  public getSentFrame(index: number): string {
    const frame = this.sentFrames[index];
    if (frame === undefined) {
      throw new Error(`Frame at index ${index} not found (total: ${this.sentFrames.length})`);
    }
    return frame;
  }

  public parseSentFrame<T = MockSentFrame>(index: number): T {
    return JSON.parse(this.getSentFrame(index)) as T;
  }

  private flushTicks(): void {}
}

const flushMicrotasks = async () => {
  await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
};

describe('DiscordBridgeClient', () => {
  let mockSockets: MockWebSocket[];
  let activeClients: DiscordBridgeClient[];

  beforeEach(() => {
    vi.useFakeTimers();
    mockSockets = [];
    activeClients = [];
  });

  afterEach(async () => {
    for (const c of activeClients) {
      await c.close();
    }
    activeClients = [];
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function getSocket(index = 0): MockWebSocket {
    const ws = mockSockets[index];
    if (!ws) {
      throw new Error(`Mock socket at index ${index} not found`);
    }
    return ws;
  }

  function createClient(
    options?: Partial<{ wsUrl: string; supertoken: string }>
  ): DiscordBridgeClient {
    const c = new DiscordBridgeClient({
      wsUrl: options?.wsUrl ?? 'ws://127.0.0.1:8765/ws/bridge',
      supertoken: options?.supertoken ?? 'secret-token-123',
      wsFactory: () => {
        const ws = new MockWebSocket();
        mockSockets.push(ws);
        return ws as unknown as WebSocket;
      }
    });
    activeClients.push(c);
    return c;
  }

  describe('checkHealth ephemeral probe', () => {
    it('returns "Conexión correcta" (200 OK) when LOGIN_SUCCESS is received', async () => {
      const client = createClient();
      const probePromise = client.checkHealth();
      const ws = getSocket(0);
      expect(ws).toBeDefined();

      ws.triggerOpen();
      expect(ws.sentFrames.length).toBe(1);
      const loginFrame = ws.parseSentFrame(0);
      expect(loginFrame.type).toBe('LOGIN');
      expect(loginFrame.data.token).toBe('secret-token-123');

      ws.triggerMessage({
        type: 'LOGIN_SUCCESS',
        data: { id: loginFrame.data.id, status: 'ok' }
      });

      const result = await probePromise;
      expect(result).toEqual({
        status: 'connected',
        healthy: true,
        message: 'Conexión correcta'
      });
      expect(ws.closeCode).toBe(1000);
    });

    it('returns "No se puede llegar a él" (503) when socket errors before open', async () => {
      const client = createClient();
      const probePromise = client.checkHealth();
      const ws = getSocket(0);

      ws.triggerError(new Error('ECONNREFUSED'));

      const result = await probePromise;
      expect(result).toEqual({
        status: 'unreachable',
        healthy: false,
        message: 'No se puede llegar a él',
        details:
          'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
      });
    });

    it('returns "No se puede llegar a él" (503) when socket closes before open', async () => {
      const client = createClient();
      const probePromise = client.checkHealth();
      const ws = getSocket(0);

      ws.close(1006, 'Connection dropped before open');

      const result = await probePromise;
      expect(result).toEqual({
        status: 'unreachable',
        healthy: false,
        message: 'No se puede llegar a él',
        details:
          'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
      });
    });

    it('returns "No se puede llegar a él" (503) when connection times out before open', async () => {
      const client = createClient();
      const probePromise = client.checkHealth();

      await vi.advanceTimersByTimeAsync(5000);

      const result = await probePromise;
      expect(result).toEqual({
        status: 'unreachable',
        healthy: false,
        message: 'No se puede llegar a él',
        details:
          'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
      });
    });

    it('returns "No se puede llegar a él" (503) immediately when wsUrl is empty', async () => {
      const emptyClient = new DiscordBridgeClient({
        wsUrl: '',
        supertoken: 'secret-token-123'
      });

      const result = await emptyClient.checkHealth();
      expect(result).toEqual({
        status: 'unreachable',
        healthy: false,
        message: 'No se puede llegar a él',
        details:
          'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
      });
      expect(mockSockets.length).toBe(0);
    });

    it('returns "No se pudo autenticar" (503) when server closes socket after LOGIN', async () => {
      const client = createClient();
      const probePromise = client.checkHealth();
      const ws = getSocket(0);

      ws.triggerOpen();
      ws.close(4001, 'Authentication failed');

      const result = await probePromise;
      expect(result).toEqual({
        status: 'authentication_failed',
        healthy: false,
        message: 'No se pudo autenticar',
        details:
          'Enviar el login, no recibir respuesta y cerrarse el websocket por parte del servidor, revisen el super token en env'
      });
    });

    it('returns "No se pudo autenticar" (503) when probe times out waiting for LOGIN_SUCCESS', async () => {
      const client = createClient();
      const probePromise = client.checkHealth();
      const ws = getSocket(0);

      ws.triggerOpen();
      await vi.advanceTimersByTimeAsync(5000);

      const result = await probePromise;
      expect(result).toEqual({
        status: 'authentication_failed',
        healthy: false,
        message: 'No se pudo autenticar',
        details:
          'Enviar el login, no recibir respuesta y cerrarse el websocket por parte del servidor, revisen el super token en env'
      });
    });
  });

  describe('Sequential queue dispatch', () => {
    it('releases the queue lock on QUEUED without waiting for downstream events', async () => {
      const client = createClient();
      const p1 = client.send({
        type: 'TEST_OPCODE_1',
        data: {
          id: 'item-1',
          content: 'Payload 1'
        }
      });

      const p2 = client.send({
        type: 'TEST_OPCODE_2',
        data: {
          id: 'item-2',
          content: 'Payload 2'
        }
      });

      const ws = getSocket(0);
      ws.triggerOpen();

      // Handshake login
      const login = ws.parseSentFrame(0);
      ws.triggerMessage({ type: 'LOGIN_SUCCESS', data: { id: login.data.id, status: 'ok' } });

      // Only item 1 should be transmitted initially
      expect(ws.sentFrames.length).toBe(2);
      const frame1 = ws.parseSentFrame(1);
      expect(frame1.type).toBe('TEST_OPCODE_1');
      expect(frame1.data.content).toBe('Payload 1');

      // Server responds with Phase 1 QUEUED for item 1
      ws.triggerMessage({ type: 'QUEUED', data: { id: frame1.data.id } });

      // item 1 resolves immediately
      await p1;

      // item 2 is dispatched immediately on queueMicrotask without waiting for any further item 1 events
      await flushMicrotasks();
      expect(ws.sentFrames.length).toBe(3);
      const frame2 = ws.parseSentFrame(2);
      expect(frame2.type).toBe('TEST_OPCODE_2');
      expect(frame2.data.content).toBe('Payload 2');

      // Later server frame for item 1 can arrive without blocking anything
      ws.triggerMessage({
        type: 'TEST_OPCODE_1_CONFIRMED',
        data: { id: frame1.data.id, message_id: 111, channel_id: 222 }
      });

      // item 2 receives QUEUED and resolves
      ws.triggerMessage({ type: 'QUEUED', data: { id: frame2.data.id } });
      await p2;
    });

    it('emits frame:sending when socket.send executes for an in-flight item', async () => {
      const client = createClient();
      const sendingEvents: { type: string; id: string }[] = [];
      client.on('frame:sending', (event) => {
        sendingEvents.push(event);
      });

      const p = client.send({
        type: 'PING',
        data: {
          id: 'ping-123'
        }
      });

      const ws = getSocket(0);
      ws.triggerOpen();
      const login = ws.parseSentFrame(0);
      ws.triggerMessage({ type: 'LOGIN_SUCCESS', data: { id: login.data.id, status: 'ok' } });

      expect(sendingEvents.length).toBe(1);
      const sentFrame = ws.parseSentFrame(1);
      expect(sendingEvents[0]?.type).toBe('PING');
      expect(sendingEvents[0]?.id).toBe(sentFrame.data.id);

      ws.triggerMessage({ type: 'QUEUED', data: { id: sentFrame.data.id } });
      await p;
    });
  });

  describe('Anti-stampede pause and cumulative timeout', () => {
    it('pauses queue on RATE_LIMITED and retries after retry_after_seconds', async () => {
      const client = createClient();
      const retryEvents: { type: string; id: string; nextRetryInSeconds: number }[] = [];
      client.on('frame:retrying', (event) => {
        retryEvents.push(event);
      });

      const p = client.send({
        type: 'RATE_LIMIT_TEST',
        data: {
          id: 'rl-item-1',
          foo: 'bar'
        }
      });

      const ws = getSocket(0);
      ws.triggerOpen();
      const login = ws.parseSentFrame(0);
      ws.triggerMessage({ type: 'LOGIN_SUCCESS', data: { id: login.data.id, status: 'ok' } });

      const sentFrame = ws.parseSentFrame(1);
      // Server responds with RATE_LIMITED for 30s
      ws.triggerMessage({
        type: 'ERROR',
        data: { id: sentFrame.data.id, code: 'RATE_LIMITED', retry_after_seconds: 30 }
      });

      expect(retryEvents.length).toBe(1);
      expect(retryEvents[0]?.type).toBe('RATE_LIMIT_TEST');
      expect(retryEvents[0]?.id).toBe('rl-item-1');
      expect(retryEvents[0]?.nextRetryInSeconds).toBe(30);

      // At 29s remains paused
      await vi.advanceTimersByTimeAsync(29000);
      expect(ws.sentFrames.length).toBe(2);

      // At 30s retries transmission
      await vi.advanceTimersByTimeAsync(1000);
      expect(ws.sentFrames.length).toBe(3);
      expect(ws.parseSentFrame(2).type).toBe('RATE_LIMIT_TEST');

      ws.triggerMessage({ type: 'QUEUED', data: { id: sentFrame.data.id } });
      await p;
    });

    it('triggers terminal failure with incidentId when retry duration exceeds 5 minutes', async () => {
      const client = createClient();
      const p = client.send({
        type: 'STUCK_FRAME',
        data: {
          id: 'stuck-1'
        }
      });

      const ws = getSocket(0);
      ws.triggerOpen();
      const login = ws.parseSentFrame(0);
      ws.triggerMessage({ type: 'LOGIN_SUCCESS', data: { id: login.data.id, status: 'ok' } });

      const sentFrame = ws.parseSentFrame(1);

      // Simulate 4 consecutive 60s RATE_LIMITED frames
      for (let i = 0; i < 4; i++) {
        ws.triggerMessage({
          type: 'ERROR',
          data: { id: sentFrame.data.id, code: 'RATE_LIMITED', retry_after_seconds: 60 }
        });
        await vi.advanceTimersByTimeAsync(60000);
      }

      // 5th RATE_LIMITED pushes cumulative duration to 300s (5 min)
      ws.triggerMessage({
        type: 'ERROR',
        data: { id: sentFrame.data.id, code: 'RATE_LIMITED', retry_after_seconds: 60 }
      });
      const assertion = expect(p).rejects.toThrowError(/incidentId/i);
      await vi.advanceTimersByTimeAsync(60000);
      await assertion;
    });

    it('unblocks the queue to process subsequent frames after a terminal timeout', async () => {
      const client = createClient();
      const p1 = client.send({
        type: 'TIMEOUT_FRAME',
        data: {
          id: 'timeout-item'
        }
      });

      const p2 = client.send({
        type: 'VALID_FRAME',
        data: {
          id: 'subsequent-item'
        }
      });

      const ws = getSocket(0);
      ws.triggerOpen();
      const login = ws.parseSentFrame(0);
      ws.triggerMessage({ type: 'LOGIN_SUCCESS', data: { id: login.data.id, status: 'ok' } });

      const frame1 = ws.parseSentFrame(1);

      // 5 times 60s
      for (let i = 0; i < 4; i++) {
        ws.triggerMessage({
          type: 'ERROR',
          data: { id: frame1.data.id, code: 'RATE_LIMITED', retry_after_seconds: 60 }
        });
        await vi.advanceTimersByTimeAsync(60000);
      }
      ws.triggerMessage({
        type: 'ERROR',
        data: { id: frame1.data.id, code: 'RATE_LIMITED', retry_after_seconds: 60 }
      });
      const assertion1 = expect(p1).rejects.toThrow(BridgeRateLimitTimeoutError);
      await vi.advanceTimersByTimeAsync(60000);
      await assertion1;

      // p2 is dispatched now
      await flushMicrotasks();
      const frame2 = ws.parseSentFrame(ws.sentFrames.length - 1);
      expect(frame2.type).toBe('VALID_FRAME');
      expect(frame2.data.id).toBe('subsequent-item');

      ws.triggerMessage({ type: 'QUEUED', data: { id: frame2.data.id } });
      await p2;
    });
  });

  describe('Idle timeout and clean shutdown', () => {
    it('closes socket cleanly with code 1000 after 30 minutes of inactivity', async () => {
      const client = createClient();
      const p = client.send({
        type: 'IDLE_CHECK',
        data: {
          id: 'idle-item'
        }
      });

      const ws = getSocket(0);
      ws.triggerOpen();
      const login = ws.parseSentFrame(0);
      ws.triggerMessage({ type: 'LOGIN_SUCCESS', data: { id: login.data.id, status: 'ok' } });

      const frame = ws.parseSentFrame(1);
      ws.triggerMessage({ type: 'QUEUED', data: { id: frame.data.id } });
      await p;

      // Advance 29 minutes: socket still open
      await vi.advanceTimersByTimeAsync(29 * 60 * 1000);
      expect(ws.closeCode).toBeNull();

      // Advance 1 additional minute (total 30 min): socket closes cleanly with code 1000
      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
      expect(ws.closeCode).toBe(1000);
    });

    it('reconnects lazily on next send after idle close', async () => {
      const client = createClient();
      const p1 = client.send({
        type: 'FIRST_FRAME',
        data: {
          id: 'first-item'
        }
      });

      const ws1 = getSocket(0);
      ws1.triggerOpen();
      const login1 = ws1.parseSentFrame(0);
      ws1.triggerMessage({ type: 'LOGIN_SUCCESS', data: { id: login1.data.id, status: 'ok' } });

      const frame1 = ws1.parseSentFrame(1);
      ws1.triggerMessage({ type: 'QUEUED', data: { id: frame1.data.id } });
      await p1;

      // Close on idle
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
      expect(ws1.closeCode).toBe(1000);

      // Second frame opens a new socket connection
      const p2 = client.send({
        type: 'SECOND_FRAME',
        data: {
          id: 'second-item'
        }
      });

      expect(mockSockets.length).toBe(2);
      const ws2 = getSocket(1);
      ws2.triggerOpen();
      const login2 = ws2.parseSentFrame(0);
      ws2.triggerMessage({ type: 'LOGIN_SUCCESS', data: { id: login2.data.id, status: 'ok' } });

      const frame2 = ws2.parseSentFrame(1);
      ws2.triggerMessage({ type: 'QUEUED', data: { id: frame2.data.id } });
      await p2;
    });

    it('cleans up resources and rejects pending frames on explicit close()', async () => {
      const client = createClient();
      const p = client.send({
        type: 'PENDING_FRAME',
        data: {
          id: 'pending-item'
        }
      });

      const assertion = expect(p).rejects.toThrowError(/closed/i);
      await client.close();
      await assertion;
    });
  });

  describe('Dynamic opcode routing for server frames', () => {
    it('dynamically emits events matching server frame type', async () => {
      const client = createClient();
      const p = client.send({
        type: 'CUSTOM_REQ',
        data: {
          id: 'custom-123'
        }
      });

      const ws = getSocket(0);
      ws.triggerOpen();
      const login = ws.parseSentFrame(0);
      ws.triggerMessage({ type: 'LOGIN_SUCCESS', data: { id: login.data.id, status: 'ok' } });

      const frame = ws.parseSentFrame(1);
      ws.triggerMessage({ type: 'QUEUED', data: { id: frame.data.id } });
      await p;

      let customEventData: unknown = null;
      client.on('CUSTOM_RESPONSE_EVENT', (data) => {
        customEventData = data;
      });

      ws.triggerMessage({
        type: 'CUSTOM_RESPONSE_EVENT',
        data: {
          id: frame.data.id,
          channel_id: '123456789',
          result: 'success'
        }
      });

      expect(customEventData).toEqual({
        id: frame.data.id,
        channel_id: '123456789',
        result: 'success'
      });
    });

    it('dynamically emits error/failure events by opcode without hardcoded handlers', async () => {
      const client = createClient();
      const p = client.send({
        type: 'CUSTOM_REQ_2',
        data: {
          id: 'custom-456'
        }
      });

      const ws = getSocket(0);
      ws.triggerOpen();
      const login = ws.parseSentFrame(0);
      ws.triggerMessage({ type: 'LOGIN_SUCCESS', data: { id: login.data.id, status: 'ok' } });

      const frame = ws.parseSentFrame(1);
      ws.triggerMessage({ type: 'QUEUED', data: { id: frame.data.id } });
      await p;

      let failureEventData: unknown = null;
      client.on('CUSTOM_FAILURE_EVENT', (data) => {
        failureEventData = data;
      });

      ws.triggerMessage({
        type: 'CUSTOM_FAILURE_EVENT',
        data: {
          id: frame.data.id,
          reason: 'Permission denied on Discord channel'
        }
      });

      expect(failureEventData).toEqual({
        id: frame.data.id,
        reason: 'Permission denied on Discord channel'
      });
    });
  });

  describe('discordBridgeRouter HTTP endpoints', () => {
    it('returns 200 OK with connected health response and Cache-Control: no-store', async () => {
      const app = express();
      const mockChecker: BridgeHealthChecker = {
        checkHealth: vi.fn().mockResolvedValue({
          status: 'connected',
          healthy: true,
          message: 'Conexión correcta'
        })
      };
      app.use('/api/v1/bridge', createDiscordBridgeRouter({ bridgeClient: mockChecker }));

      const res = await request(app).get('/api/v1/bridge/health');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        status: 'connected',
        healthy: true,
        message: 'Conexión correcta'
      });
    });

    it('returns 503 Service Unavailable when bridge is unreachable', async () => {
      const app = express();
      const mockChecker: BridgeHealthChecker = {
        checkHealth: vi.fn().mockResolvedValue({
          status: 'unreachable',
          healthy: false,
          message: 'No se puede llegar a él',
          details:
            'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
        })
      };
      app.use('/api/v1/bridge', discordBridgeRouter(mockChecker));

      const res = await request(app).get('/api/v1/bridge/health');
      expect(res.status).toBe(503);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        status: 'unreachable',
        healthy: false,
        message: 'No se puede llegar a él',
        details:
          'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
      });
    });

    it('returns 503 Service Unavailable when authentication fails', async () => {
      const app = express();
      const mockChecker: BridgeHealthChecker = {
        checkHealth: vi.fn().mockResolvedValue({
          status: 'authentication_failed',
          healthy: false,
          message: 'No se pudo autenticar',
          details:
            'Enviar el login, no recibir respuesta y cerrarse el websocket por parte del servidor, revisen el super token en env'
        })
      };
      app.use('/api/v1/bridge', createDiscordBridgeRouter({ bridgeClient: mockChecker }));

      const res = await request(app).get('/api/v1/bridge/health');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        status: 'authentication_failed',
        healthy: false,
        message: 'No se pudo autenticar',
        details:
          'Enviar el login, no recibir respuesta y cerrarse el websocket por parte del servidor, revisen el super token en env'
      });
    });

    it('catches unexpected exceptions from checkHealth and returns 503 fallback', async () => {
      const app = express();
      const mockChecker: BridgeHealthChecker = {
        checkHealth: vi.fn().mockRejectedValue(new Error('Fatal unexpected internal error'))
      };
      app.use('/api/v1/bridge', createDiscordBridgeRouter({ bridgeClient: mockChecker }));

      const res = await request(app).get('/api/v1/bridge/health');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        status: 'unreachable',
        healthy: false,
        message: 'No se puede llegar a él',
        details:
          'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
      });
    });
  });
});
