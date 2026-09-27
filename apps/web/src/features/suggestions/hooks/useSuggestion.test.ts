import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialSuggestionState, suggestionReducer } from '../state/suggestion-reducer.js';
import type { UseSuggestionReturn } from '../types/suggestions.types.js';
import { useSuggestion } from './useSuggestion.js';

describe('useSuggestion hook and state machine lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders initial idle state in React harness', () => {
    let capturedHook: UseSuggestionReturn | null = null;

    function testHarness() {
      const hook = useSuggestion();
      capturedHook = hook;
      return React.createElement('div', null, hook.status);
    }

    const html = renderToString(React.createElement(testHarness));

    expect(html).toContain('idle');
    expect(capturedHook).not.toBeNull();
    const hook = capturedHook as unknown as UseSuggestionReturn;
    expect(hook.status).toBe('idle');
    expect(hook.isSubmitting).toBe(false);
    expect(hook.isPolling).toBe(false);
    expect(typeof hook.submitSuggestion).toBe('function');
    expect(typeof hook.reset).toBe('function');
  });

  it('transitions state through queued -> sending -> processing -> confirmed', () => {
    let state = suggestionReducer(initialSuggestionState, {
      type: 'submitted',
      id: 'sug-123'
    });
    expect(state.status).toBe('queued');
    expect(state.id).toBe('sug-123');
    expect(state.isPolling).toBe(true);

    state = suggestionReducer(state, {
      type: 'status_update',
      payload: { id: 'sug-123', status: 'sending' }
    });
    expect(state.status).toBe('sending');
    expect(state.isPolling).toBe(true);

    state = suggestionReducer(state, {
      type: 'status_update',
      payload: { id: 'sug-123', status: 'processing' }
    });
    expect(state.status).toBe('processing');
    expect(state.isPolling).toBe(true);

    state = suggestionReducer(state, {
      type: 'status_update',
      payload: { id: 'sug-123', status: 'confirmed' }
    });
    expect(state.status).toBe('confirmed');
    expect(state.isPolling).toBe(false);
    expect(state.isSubmitting).toBe(false);
  });

  it('handles retrying status with countdown decrement', () => {
    let state = suggestionReducer(initialSuggestionState, {
      type: 'submitted',
      id: 'sug-123'
    });
    state = suggestionReducer(state, {
      type: 'status_update',
      payload: { id: 'sug-123', status: 'retrying', nextRetryInSeconds: 3 }
    });
    expect(state.status).toBe('retrying');
    expect(state.nextRetryInSeconds).toBe(3);

    state = suggestionReducer(state, { type: 'tick_countdown' });
    expect(state.nextRetryInSeconds).toBe(2);

    state = suggestionReducer(state, { type: 'tick_countdown' });
    expect(state.nextRetryInSeconds).toBe(1);

    state = suggestionReducer(state, { type: 'tick_countdown' });
    expect(state.nextRetryInSeconds).toBe(0);
  });

  it('handles terminal failed status with incidentId', () => {
    let state = suggestionReducer(initialSuggestionState, {
      type: 'submitted',
      id: 'sug-123'
    });
    state = suggestionReducer(state, {
      type: 'status_update',
      payload: {
        id: 'sug-123',
        status: 'failed',
        incidentId: 'inc-999-uuid',
        error: 'Max retry timeout reached'
      }
    });

    expect(state.status).toBe('failed');
    expect(state.incidentId).toBe('inc-999-uuid');
    expect(state.error).toBe('Max retry timeout reached');
    expect(state.isSubmitting).toBe(false);
    expect(state.isPolling).toBe(false);
  });
});
