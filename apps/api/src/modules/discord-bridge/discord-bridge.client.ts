import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  BridgeHealthMessage,
  BridgeHealthResponse,
  BridgeHealthStatus,
  BridgeLoginFrame,
  BridgeServerFrame
} from '@rcl/contracts';
import { WebSocket } from 'ws';

export type WebSocketFactory = (url: string) => WebSocket;

export interface BridgeOutgoingFrame {
  type: string;
  data: { id: string; [key: string]: unknown };
}

export interface DiscordBridgeClientOptions {
  wsUrl: string;
  supertoken: string;
  idleTimeoutMs?: number | undefined; // Default: 30 minutes (30 * 60 * 1000)
  maxRetryDurationMs?: number | undefined; // Default: 5 minutes (5 * 60 * 1000)
  connectTimeoutMs?: number | undefined; // Default: 10 seconds (10 * 1000)
  healthProbeTimeoutMs?: number | undefined; // Default: 5 seconds (5 * 1000)
  wsFactory?: WebSocketFactory | undefined;
  sleepFn?: ((ms: number) => Promise<void>) | undefined;
}

export interface QueueItem {
  id: string;
  frame: BridgeOutgoingFrame;
  totalRetryElapsedMs: number;
  resolve: () => void;
  reject: (error: Error) => void;
  onRetrying?: ((nextRetryInSeconds: number, incidentId?: string | undefined) => void) | undefined;
}

interface PendingPhase1 {
  id: string;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class BridgeRateLimitTimeoutError extends Error {
  public readonly incidentId: string;

  constructor(message: string, incidentId: string) {
    super(`[INCIDENT ${incidentId}] Type: RATE_LIMIT_TIMEOUT | Message: ${message}`);
    this.name = 'BridgeRateLimitTimeoutError';
    this.incidentId = incidentId;
  }
}

class HandledRateLimitError extends Error {
  constructor(public readonly pauseMs: number) {
    super('RATE_LIMITED handled by queue pause');
    this.name = 'HandledRateLimitError';
  }
}

export class DiscordBridgeClient extends EventEmitter {
  private readonly wsUrl: string;
  private readonly supertoken: string;
  private readonly idleTimeoutMs: number;
  private readonly maxRetryDurationMs: number;
  private readonly connectTimeoutMs: number;
  private readonly healthProbeTimeoutMs: number;
  private readonly wsFactory: WebSocketFactory;
  private readonly sleepFn?: ((ms: number) => Promise<void>) | undefined;

  private socket: WebSocket | null = null;
  private connectPromise: Promise<WebSocket> | null = null;
  private isAuthenticated = false;
  private idleTimer: NodeJS.Timeout | null = null;

  private queue: QueueItem[] = [];
  private isProcessingQueue = false;
  private isPaused = false;
  private isClosed = false;
  private pendingPhase1: PendingPhase1 | null = null;

  constructor(options: DiscordBridgeClientOptions) {
    super();
    this.wsUrl = options.wsUrl;
    this.supertoken = options.supertoken;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000;
    this.maxRetryDurationMs = options.maxRetryDurationMs ?? 5 * 60 * 1000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10 * 1000;
    this.healthProbeTimeoutMs = options.healthProbeTimeoutMs ?? 5 * 1000;
    this.wsFactory = options.wsFactory ?? ((url: string) => new WebSocket(url));
    this.sleepFn = options.sleepFn;
  }

  public async send(frame: BridgeOutgoingFrame): Promise<void> {
    if (this.isClosed) {
      throw new Error('Discord bridge client is closed');
    }

    if (!frame?.data?.id) {
      throw new Error('Frame must have a data.id');
    }

    const id = frame.data.id;

    return new Promise<void>((resolve, reject) => {
      const item: QueueItem = {
        id,
        frame,
        totalRetryElapsedMs: 0,
        resolve,
        reject
      };

      this.queue.push(item);

      if (!this.socket || !this.isAuthenticated) {
        void this.ensureConnected();
      } else {
        void this.processQueue();
      }
    });
  }

  public async checkHealth(): Promise<BridgeHealthResponse> {
    const probeUrl = this.wsUrl;
    const probeToken = this.supertoken;

    if (!probeUrl) {
      return {
        status: 'unreachable',
        healthy: false,
        message: 'No se puede llegar a él',
        details:
          'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
      };
    }

    return new Promise<BridgeHealthResponse>((resolve) => {
      let ws: WebSocket | null = null;
      let isOpen = false;
      let resolved = false;
      const probeId = crypto.randomUUID();

      const finish = (result: BridgeHealthResponse) => {
        if (resolved) {
          return;
        }
        resolved = true;
        clearTimeout(timer);

        if (ws) {
          try {
            ws.removeAllListeners();
            if (ws.readyState === WebSocket.OPEN) {
              ws.close(1000, 'Health check complete');
            } else {
              ws.terminate();
            }
          } catch {
            // Ignore socket cleanup exceptions during health check
          }
          ws = null;
        }

        resolve(result);
      };

      const timer = setTimeout(() => {
        if (!isOpen) {
          finish({
            status: 'unreachable',
            healthy: false,
            message: 'No se puede llegar a él',
            details:
              'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
          });
        } else {
          finish({
            status: 'authentication_failed',
            healthy: false,
            message: 'No se pudo autenticar',
            details:
              'Enviar el login, no recibir respuesta y cerrarse el websocket por parte del servidor, revisen el super token en env'
          });
        }
      }, this.healthProbeTimeoutMs);

      try {
        ws = this.wsFactory(probeUrl);
      } catch {
        return finish({
          status: 'unreachable',
          healthy: false,
          message: 'No se puede llegar a él',
          details:
            'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
        });
      }

      ws.on('open', () => {
        isOpen = true;
        const loginPayload: BridgeLoginFrame = {
          type: 'LOGIN',
          data: {
            id: probeId,
            token: probeToken
          }
        };

        try {
          ws?.send(JSON.stringify(loginPayload));
        } catch {
          finish({
            status: 'authentication_failed',
            healthy: false,
            message: 'No se pudo autenticar',
            details:
              'Enviar el login, no recibir respuesta y cerrarse el websocket por parte del servidor, revisen el super token en env'
          });
        }
      });

      ws.on('message', (rawData) => {
        try {
          const payload = JSON.parse(rawData.toString()) as {
            type?: string;
            data?: { id?: string; status?: string };
          };

          if (payload.type === 'LOGIN_SUCCESS' && payload.data?.id === probeId) {
            finish({
              status: 'connected',
              healthy: true,
              message: 'Conexión correcta'
            });
          }
        } catch {
          // Ignore invalid frames during health check until timeout or closure
        }
      });

      ws.on('error', () => {
        if (!isOpen) {
          finish({
            status: 'unreachable',
            healthy: false,
            message: 'No se puede llegar a él',
            details:
              'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
          });
        } else {
          finish({
            status: 'authentication_failed',
            healthy: false,
            message: 'No se pudo autenticar',
            details:
              'Enviar el login, no recibir respuesta y cerrarse el websocket por parte del servidor, revisen el super token en env'
          });
        }
      });

      ws.on('close', () => {
        if (!isOpen) {
          finish({
            status: 'unreachable',
            healthy: false,
            message: 'No se puede llegar a él',
            details:
              'El websocket no pudo iniciarse, comprobar variables env para asegurar la url correcta'
          });
        } else {
          finish({
            status: 'authentication_failed',
            healthy: false,
            message: 'No se pudo autenticar',
            details:
              'Enviar el login, no recibir respuesta y cerrarse el websocket por parte del servidor, revisen el super token en env'
          });
        }
      });
    });
  }

  public async close(): Promise<void> {
    this.isClosed = true;

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.pendingPhase1) {
      this.pendingPhase1.reject(new Error('Discord bridge client closed'));
      this.pendingPhase1 = null;
    }

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item?.reject(new Error('Discord bridge client closed'));
    }

    this.cleanupSocket(1000, 'Client shutdown');
    this.isAuthenticated = false;
    this.connectPromise = null;
  }

  private async ensureConnected(): Promise<WebSocket> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.isAuthenticated) {
      return this.socket;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<WebSocket>((resolve, reject) => {
      this.cleanupSocket();

      let ws: WebSocket;
      try {
        ws = this.wsFactory(this.wsUrl);
      } catch (err) {
        this.connectPromise = null;
        return reject(err instanceof Error ? err : new Error(String(err)));
      }

      this.socket = ws;

      const connectTimer = setTimeout(() => {
        this.cleanupSocket();
        this.connectPromise = null;
        reject(new Error('Connection timeout to Discord bridge'));
      }, this.connectTimeoutMs);

      if (typeof connectTimer.unref === 'function') {
        connectTimer.unref();
      }

      const authId = crypto.randomUUID();

      ws.on('open', () => {
        const loginFrame: BridgeLoginFrame = {
          type: 'LOGIN',
          data: {
            id: authId,
            token: this.supertoken
          }
        };

        try {
          ws.send(JSON.stringify(loginFrame));
          this.resetIdleTimeout();
        } catch (err) {
          clearTimeout(connectTimer);
          this.cleanupSocket();
          this.connectPromise = null;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });

      ws.on('message', (raw) => {
        this.resetIdleTimeout();

        let payload: unknown;
        try {
          payload = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (
          typeof payload === 'object' &&
          payload !== null &&
          'type' in payload &&
          (payload as { type: unknown }).type === 'LOGIN_SUCCESS' &&
          'data' in payload &&
          (payload as { data: { id?: unknown } }).data?.id === authId
        ) {
          clearTimeout(connectTimer);
          this.isAuthenticated = true;
          this.connectPromise = null;
          resolve(ws);

          // Synchronously dispatch queue on authentication
          if (!this.isPaused && !this.isClosed && this.queue.length > 0) {
            void this.processQueue();
          }
          return;
        }

        this.handleIncomingFrame(payload);
      });

      ws.on('error', (err) => {
        if (!this.isAuthenticated) {
          clearTimeout(connectTimer);
          this.cleanupSocket();
          this.connectPromise = null;
          reject(err instanceof Error ? err : new Error(String(err)));
        } else {
          this.handleSocketDisconnect(err instanceof Error ? err : new Error(String(err)));
        }
      });

      ws.on('close', (code, reason) => {
        if (!this.isAuthenticated) {
          clearTimeout(connectTimer);
          this.cleanupSocket();
          this.connectPromise = null;
          reject(
            new Error(`WebSocket closed before authentication (${code}: ${reason.toString()})`)
          );
        } else {
          this.handleSocketDisconnect(new Error(`WebSocket closed (${code})`));
        }
      });
    });

    return this.connectPromise;
  }

  private handleIncomingFrame(payload: unknown): void {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('type' in payload) ||
      typeof (payload as { type: unknown }).type !== 'string'
    ) {
      return;
    }

    const frame = payload as {
      type: string;
      data?: {
        id?: string;
        code?: string;
        message?: string;
        retry_after_seconds?: number;
        [key: string]: unknown;
      };
    };
    const currentItem = this.queue[0];

    // Generic opcode emission for all server frames
    this.emit(frame.type, frame.data);

    switch (frame.type) {
      case 'QUEUED': {
        if (this.pendingPhase1 && (!frame.data?.id || frame.data.id === this.pendingPhase1.id)) {
          this.pendingPhase1.resolve();
        }
        break;
      }

      case 'ERROR': {
        if (frame.data?.code === 'RATE_LIMITED' && currentItem) {
          const retryAfter =
            typeof frame.data.retry_after_seconds === 'number'
              ? frame.data.retry_after_seconds
              : 30;
          const pauseMs = Math.max(1000, Math.ceil(retryAfter * 1000));
          currentItem.totalRetryElapsedMs += pauseMs;

          this.isPaused = true;
          const nextRetrySeconds = Math.ceil(retryAfter);
          this.emit('frame:retrying', {
            type: currentItem.frame.type,
            id: currentItem.id,
            nextRetryInSeconds: nextRetrySeconds
          });

          if (currentItem.onRetrying) {
            currentItem.onRetrying(nextRetrySeconds);
          }

          this.pendingPhase1?.reject(new HandledRateLimitError(pauseMs));
        } else if (this.pendingPhase1) {
          this.pendingPhase1.reject(
            new Error(frame.data?.message ?? 'Bridge returned ERROR frame')
          );
        }
        break;
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.queue.length === 0 || this.isPaused || this.isClosed) {
      return;
    }

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.isAuthenticated) {
      void this.ensureConnected();
      return;
    }

    this.isProcessingQueue = true;
    const currentItem = this.queue[0];
    if (!currentItem) {
      this.isProcessingQueue = false;
      return;
    }
    const socket = this.socket;

    const phase1Promise = new Promise<void>((resolve, reject) => {
      this.pendingPhase1 = {
        id: currentItem.id,
        resolve,
        reject
      };
    });

    socket.send(JSON.stringify(currentItem.frame));
    this.emit('frame:sending', { type: currentItem.frame.type, id: currentItem.id });
    this.resetIdleTimeout();

    try {
      await phase1Promise;

      this.queue.shift();
      this.pendingPhase1 = null;
      this.isProcessingQueue = false;

      currentItem.resolve();
    } catch (error) {
      if (error instanceof HandledRateLimitError) {
        await this.sleep(error.pauseMs);

        if (currentItem.totalRetryElapsedMs >= this.maxRetryDurationMs) {
          const incidentId = crypto.randomUUID();
          console.error(
            `[INCIDENT ${incidentId}] Type: RATE_LIMIT_TIMEOUT | Message: Max retry duration (5m) exceeded for frame ${currentItem.id}`
          );
          const err = new BridgeRateLimitTimeoutError(
            `Max retry duration exceeded for frame ${currentItem.id} (incidentId: ${incidentId})`,
            incidentId
          );
          this.queue.shift();
          this.isPaused = false;
          this.isProcessingQueue = false;
          this.pendingPhase1 = null;

          currentItem.reject(err);
          this.emit('frame:failed', {
            type: currentItem.frame.type,
            id: currentItem.id,
            incidentId,
            error: err.message
          });

          if (!this.isClosed && this.queue.length > 0) {
            queueMicrotask(() => void this.processQueue());
          }
          return;
        }

        this.isPaused = false;
        this.isProcessingQueue = false;
        this.pendingPhase1 = null;

        if (!this.isClosed && this.queue.length > 0) {
          queueMicrotask(() => void this.processQueue());
        }
        return;
      }

      if (error instanceof BridgeRateLimitTimeoutError) {
        this.queue.shift();
        this.isPaused = false;
        this.isProcessingQueue = false;
        this.pendingPhase1 = null;

        currentItem.reject(error);
        this.emit('frame:failed', {
          type: currentItem.frame.type,
          id: currentItem.id,
          incidentId: error.incidentId,
          error: error.message
        });

        if (!this.isClosed && this.queue.length > 0) {
          queueMicrotask(() => void this.processQueue());
        }
        return;
      }

      // Other error (e.g. fatal disconnect or client shutdown)
      this.queue.shift();
      this.isProcessingQueue = false;
      this.pendingPhase1 = null;

      currentItem.reject(error instanceof Error ? error : new Error(String(error)));

      if (!this.isClosed && this.queue.length > 0) {
        queueMicrotask(() => void this.processQueue());
      }
      return;
    }

    if (!this.isPaused && !this.isClosed && this.queue.length > 0) {
      queueMicrotask(() => void this.processQueue());
    }
  }

  private resetIdleTimeout(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      this.handleIdleTimeout();
    }, this.idleTimeoutMs);

    if (typeof this.idleTimer.unref === 'function') {
      this.idleTimer.unref();
    }
  }

  private handleIdleTimeout(): void {
    this.cleanupSocket(1000, '30-minute idle timeout reached');
  }

  private handleSocketDisconnect(err: Error): void {
    this.cleanupSocket();
    if (this.pendingPhase1) {
      this.pendingPhase1.reject(err);
      this.pendingPhase1 = null;
    }
  }

  private cleanupSocket(code = 1000, reason = ''): void {
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.close(code, reason);
        }
      } catch {
        // Ignore socket cleanup exceptions
      }
      this.socket = null;
    }

    this.isAuthenticated = false;
  }

  private sleep(ms: number): Promise<void> {
    if (this.sleepFn) {
      return this.sleepFn(ms);
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
