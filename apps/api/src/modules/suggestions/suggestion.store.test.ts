import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SuggestionStore } from './suggestion.store.js';

describe('SuggestionStore', () => {
  let store: SuggestionStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new SuggestionStore({ enablePeriodicCleanup: false });
  });

  afterEach(() => {
    store.clear();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('stores and retrieves suggestion state', () => {
    store.set({
      id: 'uuid-1',
      status: 'queued',
      suggestion: 'Prueba de sugerencia',
      authorId: '123',
      authorUsername: 'TestUser'
    });

    const record = store.get('uuid-1');
    expect(record).toBeDefined();
    expect(record?.id).toBe('uuid-1');
    expect(record?.status).toBe('queued');
    expect(record?.suggestion).toBe('Prueba de sugerencia');
    expect(typeof record?.createdAt).toBe('number');
    expect(typeof record?.updatedAt).toBe('number');
  });

  it('returns undefined for non-existent IDs', () => {
    expect(store.get('unknown-id')).toBeUndefined();
  });

  it('updates status cleanly through lifecycle: queued -> sending -> retrying -> confirmed', () => {
    store.set({
      id: 'uuid-1',
      status: 'queued',
      suggestion: 'Test',
      authorId: '0',
      authorUsername: 'Anónimo'
    });

    store.update('uuid-1', { status: 'sending' });
    expect(store.get('uuid-1')?.status).toBe('sending');

    store.update('uuid-1', { status: 'retrying', nextRetryInSeconds: 30 });
    expect(store.get('uuid-1')?.status).toBe('retrying');
    expect(store.get('uuid-1')?.nextRetryInSeconds).toBe(30);

    store.update('uuid-1', { status: 'confirmed', messageId: 999, channelId: 888 });
    const confirmed = store.get('uuid-1');
    expect(confirmed?.status).toBe('confirmed');
    expect(confirmed?.messageId).toBe(999);
    expect(confirmed?.channelId).toBe(888);
    expect(confirmed?.nextRetryInSeconds).toBeUndefined();
  });

  it('updates status to failed with incidentId and error', () => {
    store.set({
      id: 'uuid-1',
      status: 'retrying',
      suggestion: 'Test',
      authorId: '0',
      authorUsername: 'Anónimo'
    });

    store.update('uuid-1', {
      status: 'failed',
      incidentId: 'inc-123',
      error: 'Connection timeout'
    });

    const record = store.get('uuid-1');
    expect(record?.status).toBe('failed');
    expect(record?.incidentId).toBe('inc-123');
    expect(record?.error).toBe('Connection timeout');
  });

  it('expires records older than 2 hours (TTL)', () => {
    store.set({
      id: 'uuid-1',
      status: 'queued',
      suggestion: 'Expiring item',
      authorId: '0',
      authorUsername: 'Anónimo'
    });

    // Advance 1h 59m 59s: item still exists
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 - 1000);
    expect(store.get('uuid-1')).toBeDefined();

    // Advance 2 seconds (total > 2 hours): item expired
    vi.advanceTimersByTime(2000);
    expect(store.get('uuid-1')).toBeUndefined();
  });

  it('prunes expired records and retains unexpired records', () => {
    store.set({
      id: 'uuid-old',
      status: 'queued',
      suggestion: 'Old',
      authorId: '0',
      authorUsername: 'A'
    });

    vi.advanceTimersByTime(1 * 60 * 60 * 1000); // 1 hour later
    store.set({
      id: 'uuid-new',
      status: 'queued',
      suggestion: 'New',
      authorId: '0',
      authorUsername: 'B'
    });

    vi.advanceTimersByTime(1 * 60 * 60 * 1000 + 1000); // Old item is > 2h, new item is ~1h old

    const pruned = store.prune();
    expect(pruned).toBe(1);
    expect(store.get('uuid-old')).toBeUndefined();
    expect(store.get('uuid-new')).toBeDefined();
    expect(store.size()).toBe(1);
  });

  it('cleanup prevents timer leaks on clear and close', () => {
    const timerStore = new SuggestionStore({ enablePeriodicCleanup: true });
    timerStore.set({ id: 'uuid-1', status: 'queued' });
    expect(timerStore.size()).toBe(1);

    timerStore.clear();
    expect(timerStore.size()).toBe(0);

    timerStore.close();
    expect(timerStore.size()).toBe(0);
  });

  it('supports delete, create, and updateStatus helpers', () => {
    const created = store.create('uuid-helper', 'queued');
    expect(created.id).toBe('uuid-helper');
    expect(created.status).toBe('queued');

    const updated = store.updateStatus('uuid-helper', 'processing');
    expect(updated?.status).toBe('processing');

    const deleted = store.delete('uuid-helper');
    expect(deleted).toBe(true);
    expect(store.get('uuid-helper')).toBeUndefined();
  });

  it('prevents terminal confirmed or failed status from regressing to intermediate status', () => {
    store.set({
      id: 'term-1',
      status: 'confirmed',
      suggestion: 'Terminal item',
      authorId: '0',
      authorUsername: 'Anónimo'
    });

    // Attempt to overwrite confirmed with processing
    const updated = store.update('term-1', { status: 'processing' });
    expect(updated?.status).toBe('confirmed');
    expect(store.get('term-1')?.status).toBe('confirmed');

    // Attempt to overwrite confirmed with queued, sending, retrying
    store.update('term-1', { status: 'queued' });
    expect(store.get('term-1')?.status).toBe('confirmed');
    store.update('term-1', { status: 'sending' });
    expect(store.get('term-1')?.status).toBe('confirmed');
    store.update('term-1', { status: 'retrying' });
    expect(store.get('term-1')?.status).toBe('confirmed');

    // Status failed is also protected
    store.set({
      id: 'term-2',
      status: 'failed',
      suggestion: 'Failed item',
      authorId: '0',
      authorUsername: 'Anónimo'
    });

    store.update('term-2', { status: 'processing' });
    expect(store.get('term-2')?.status).toBe('failed');
    store.updateStatus('term-2', 'sending');
    expect(store.get('term-2')?.status).toBe('failed');
  });
});
