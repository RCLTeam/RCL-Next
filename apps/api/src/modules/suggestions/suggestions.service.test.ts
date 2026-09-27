import { EventEmitter } from 'node:events';
import type { AuthUser } from '@rcl/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BridgeRateLimitTimeoutError,
  type DiscordBridgeClient
} from '../discord-bridge/discord-bridge.client.js';
import { IncidentLogger } from './incident-logger.js';
import { SuggestionStore } from './suggestion.store.js';
import { SuggestionsService } from './suggestions.service.js';

class MockDiscordBridgeClient extends EventEmitter {
  public send = vi.fn().mockResolvedValue(undefined);
}

describe('SuggestionsService', () => {
  let bridgeClient: MockDiscordBridgeClient;
  let store: SuggestionStore;
  let service: SuggestionsService;

  beforeEach(() => {
    bridgeClient = new MockDiscordBridgeClient();
    store = new SuggestionStore();
    service = new SuggestionsService({
      bridgeClient: bridgeClient as unknown as DiscordBridgeClient,
      store
    });
  });

  describe('Validation boundaries', () => {
    it('rejects text < 10 characters with 400 AppError', async () => {
      await expect(service.submitSuggestion({ suggestion: '123456789' })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR'
      });
    });

    it('accepts boundary of exactly 10 characters', async () => {
      bridgeClient.send.mockResolvedValueOnce(undefined);

      const res = await service.submitSuggestion({ suggestion: '1234567890' });
      expect(res.id).toBeDefined();
      expect(res.status).toBe('queued');
    });

    it('accepts boundary of exactly 1000 characters', async () => {
      bridgeClient.send.mockResolvedValueOnce(undefined);

      const res = await service.submitSuggestion({ suggestion: 'A'.repeat(1000) });
      expect(res.id).toBeDefined();
      expect(res.status).toBe('queued');
    });

    it('rejects text > 1000 characters with 400 AppError', async () => {
      await expect(
        service.submitSuggestion({ suggestion: 'A'.repeat(1001) })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR'
      });
    });

    it('rejects whitespace-only text', async () => {
      await expect(service.submitSuggestion({ suggestion: '          ' })).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR'
      });
    });

    it('rejects non-string suggestion input', async () => {
      await expect(
        // @ts-expect-error testing invalid input
        service.submit({ suggestion: null })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR'
      });
    });

    it('handles whitespace padding correctly', async () => {
      bridgeClient.send.mockResolvedValueOnce(undefined);

      const res = await service.submitSuggestion({
        suggestion: '   1234567890   '
      });
      expect(res.id).toBeDefined();

      const stored = store.get(res.id);
      expect(stored?.suggestion).toBe('1234567890');
    });
  });

  describe('Author resolution', () => {
    const user: AuthUser = {
      discordId: '445566',
      username: 'Challenger',
      avatarHash: 'avatar123',
      globalName: 'Challenger Pro',
      role: 'viewer'
    };

    it('resolves real author when user is authenticated and isAnonymous is false', async () => {
      bridgeClient.send.mockResolvedValueOnce(undefined);

      await service.submitSuggestion({
        user,
        suggestion: 'Sugerencia de usuario identificado',
        isAnonymous: false
      });

      expect(bridgeClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SUGGESTION_CREATED',
          data: expect.objectContaining({
            author_id: '445566',
            author_username: 'Challenger Pro',
            author_avatar: 'avatar123'
          })
        })
      );
    });

    it('masks author as Anónimo when user is authenticated but isAnonymous is true', async () => {
      bridgeClient.send.mockResolvedValueOnce(undefined);

      await service.submitSuggestion({
        user,
        suggestion: 'Sugerencia anónima de usuario autenticado',
        isAnonymous: true
      });

      expect(bridgeClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SUGGESTION_CREATED',
          data: expect.objectContaining({
            author_id: '0',
            author_username: 'Anónimo',
            author_avatar: null
          })
        })
      );
    });

    it('defaults to real author when isAnonymous is omitted', async () => {
      bridgeClient.send.mockResolvedValueOnce(undefined);

      await service.submitSuggestion({
        user,
        suggestion: 'Sugerencia con isAnonymous omitido'
      });

      expect(bridgeClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SUGGESTION_CREATED',
          data: expect.objectContaining({
            author_id: '445566',
            author_username: 'Challenger Pro'
          })
        })
      );
    });

    it('defaults to anonymous when user is unauthenticated', async () => {
      bridgeClient.send.mockResolvedValueOnce(undefined);

      await service.submitSuggestion({
        user: null,
        suggestion: 'Sugerencia sin login previo',
        isAnonymous: false
      });

      expect(bridgeClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SUGGESTION_CREATED',
          data: expect.objectContaining({
            author_id: '0',
            author_username: 'Anónimo',
            author_avatar: null
          })
        })
      );
    });
  });

  describe('Bridge integration and lifecycle events', () => {
    it('sets store to sending and then processing upon Phase 1 QUEUED receipt', async () => {
      let resolvePromise: () => void = () => {};
      const sendPromise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });
      bridgeClient.send.mockReturnValueOnce(sendPromise);

      const { id } = await service.submitSuggestion({
        suggestion: 'Sugerencia con envio asincrono'
      });

      // Wait microtask tick for dispatchToBridge to begin
      await new Promise((r) => setTimeout(r, 0));

      // Initial state in store remains queued while waiting for socket transmission
      expect(store.get(id)?.status).toBe('queued');

      // Bridge client emits frame:sending when socket.send executes
      bridgeClient.emit('frame:sending', { type: 'SUGGESTION_CREATED', id });
      expect(store.get(id)?.status).toBe('sending');

      // Unblock Phase 1 QUEUED
      resolvePromise();

      await sendPromise;
      // Allow microtask to complete
      await new Promise((r) => setTimeout(r, 0));

      expect(store.get(id)?.status).toBe('processing');
    });

    it('does not regress terminal confirmed status to processing if confirmed arrives during send', async () => {
      let resolvePromise: () => void = () => {};
      const sendPromise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });
      bridgeClient.send.mockReturnValueOnce(sendPromise);

      const { id } = await service.submitSuggestion({
        suggestion: 'Sugerencia con confirmacion ultrarrapida'
      });

      await new Promise((r) => setTimeout(r, 0));

      // Phase 2 confirmed arrives before send completes
      bridgeClient.emit('SUGGESTION_CONFIRMED', {
        id,
        channel_id: 123,
        message_id: 456,
        thread_id: 789
      });

      expect(store.get(id)?.status).toBe('confirmed');

      // Now send resolves Phase 1 QUEUED
      resolvePromise();
      await sendPromise;
      await new Promise((r) => setTimeout(r, 0));

      // Terminal status confirmed MUST NOT regress to processing
      expect(store.get(id)?.status).toBe('confirmed');
    });

    it('does not leak EventEmitter listeners under > 10 concurrent suggestions', async () => {
      const warningSpy = vi.fn();
      process.on('warning', warningSpy);

      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < 15; i++) {
        bridgeClient.send.mockResolvedValueOnce(undefined);

        promises.push(
          service.submitSuggestion({
            suggestion: `Sugerencia concurrente numero ${i} valida`
          })
        );
      }

      await Promise.all(promises);
      await new Promise((r) => setTimeout(r, 10));

      // Trigger retrying event on the bridge client
      bridgeClient.emit('frame:retrying', {
        type: 'SUGGESTION_CREATED',
        id: 'id-0',
        nextRetryInSeconds: 10
      });

      expect(bridgeClient.listenerCount('frame:retrying')).toBeLessThanOrEqual(1);
      expect(warningSpy).not.toHaveBeenCalled();
      process.off('warning', warningSpy);
    });

    it('updates store status to confirmed upon Phase 2 event', async () => {
      bridgeClient.send.mockResolvedValueOnce(undefined);

      const { id } = await service.submitSuggestion({
        suggestion: 'Sugerencia que será confirmada'
      });

      await new Promise((r) => setTimeout(r, 0));

      bridgeClient.emit('SUGGESTION_CONFIRMED', {
        id,
        channel_id: 123,
        message_id: 456,
        thread_id: 789
      });

      const status = service.getStatus(id);
      expect(status?.status).toBe('confirmed');
    });

    it('updates store status to failed and logs incident upon Phase 2 failure', async () => {
      const loggerSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      bridgeClient.send.mockResolvedValueOnce(undefined);

      const { id } = await service.submitSuggestion({
        suggestion: 'Sugerencia que fallará en Discord'
      });

      await new Promise((r) => setTimeout(r, 0));

      bridgeClient.emit('SUGGESTION_FAILED', {
        id,
        reason: 'Missing permissions in suggestions channel'
      });

      const status = service.getStatus(id);
      expect(status?.status).toBe('failed');
      expect(status?.error).toBe('Missing permissions in suggestions channel');
      expect(status?.incidentId).toBeDefined();
      expect(loggerSpy).toHaveBeenCalled();
      loggerSpy.mockRestore();
    });

    it('updates store to retrying during rate-limit pauses', async () => {
      bridgeClient.send.mockResolvedValueOnce(undefined);

      const { id } = await service.submitSuggestion({
        suggestion: 'Sugerencia con pausa de reintento'
      });

      bridgeClient.emit('frame:retrying', {
        type: 'SUGGESTION_CREATED',
        id,
        nextRetryInSeconds: 30
      });

      const status = service.getStatus(id);
      expect(status?.status).toBe('retrying');
      expect(status?.nextRetryInSeconds).toBe(30);
    });

    it('handles BridgeRateLimitTimeoutError terminal timeout', async () => {
      bridgeClient.send.mockRejectedValueOnce(
        new BridgeRateLimitTimeoutError('5m retry timeout', 'incident-term-123')
      );

      const { id } = await service.submitSuggestion({
        suggestion: 'Sugerencia que agotará el timeout de 5m'
      });

      // Allow rejection microtasks to flush
      await new Promise((r) => setTimeout(r, 0));

      const status = service.getStatus(id);
      expect(status?.status).toBe('failed');
      expect(status?.incidentId).toBe('incident-term-123');
    });

    it('handles generic bridge rejection without incident ID gracefully', async () => {
      bridgeClient.send.mockRejectedValueOnce(new Error('Network disconnected'));

      const { id } = await service.submitSuggestion({
        suggestion: 'Sugerencia con desconexión súbita'
      });

      await new Promise((r) => setTimeout(r, 0));

      const status = service.getStatus(id);
      expect(status?.status).toBe('failed');
      expect(status?.error).toBe('Network disconnected');
      expect(status?.incidentId).toBeDefined();
    });

    it('returns null for getStatus on non-existent id', () => {
      expect(service.getStatus('non-existent-id')).toBeNull();
    });
  });
});
