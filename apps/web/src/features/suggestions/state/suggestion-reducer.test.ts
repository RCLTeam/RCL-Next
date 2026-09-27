import { describe, expect, it } from 'vitest';
import type { SuggestionState } from '../types/suggestions.types.js';
import { initialSuggestionState, suggestionReducer } from './suggestion-reducer.js';

describe('suggestionReducer state machine', () => {
  it('starts with initial idle state', () => {
    expect(initialSuggestionState.status).toBe('idle');
    expect(initialSuggestionState.isSubmitting).toBe(false);
    expect(initialSuggestionState.isPolling).toBe(false);
    expect(initialSuggestionState.id).toBeUndefined();
    expect(initialSuggestionState.countdown).toBeUndefined();
    expect(initialSuggestionState.incidentId).toBeUndefined();
  });

  it('handles SUBMIT_START by setting isSubmitting and clearing previous state', () => {
    const dirtyState = {
      ...initialSuggestionState,
      status: 'failed' as const,
      error: 'Old error',
      incidentId: 'old-uuid'
    };

    const nextState = suggestionReducer(dirtyState, { type: 'SUBMIT_START' });

    expect(nextState.isSubmitting).toBe(true);
    expect(nextState.status).toBe('idle');
    expect(nextState.error).toBeUndefined();
    expect(nextState.incidentId).toBeUndefined();
    expect(nextState.isPolling).toBe(false);
  });

  it('handles SUBMIT_SUCCESS by updating ID and starting polling', () => {
    const state = suggestionReducer(initialSuggestionState, {
      type: 'SUBMIT_SUCCESS',
      id: 'sug-42',
      status: 'queued'
    });

    expect(state.id).toBe('sug-42');
    expect(state.suggestionId).toBe('sug-42');
    expect(state.status).toBe('queued');
    expect(state.isSubmitting).toBe(false);
    expect(state.isPolling).toBe(true);
  });

  it('handles lowercase submitted alias for SUBMIT_SUCCESS', () => {
    const state = suggestionReducer(initialSuggestionState, {
      type: 'submitted',
      id: 'sug-alias'
    });

    expect(state.id).toBe('sug-alias');
    expect(state.status).toBe('queued');
    expect(state.isPolling).toBe(true);
  });

  it('handles SUBMIT_ERROR by transitioning to failed with error message', () => {
    const state = suggestionReducer(initialSuggestionState, {
      type: 'SUBMIT_ERROR',
      error: 'Network connection aborted'
    });

    expect(state.status).toBe('failed');
    expect(state.error).toBe('Network connection aborted');
    expect(state.isSubmitting).toBe(false);
    expect(state.isPolling).toBe(false);
  });

  it('transitions through status updates queued -> sending -> processing', () => {
    let state = suggestionReducer(initialSuggestionState, {
      type: 'SUBMIT_SUCCESS',
      id: 'sug-flow'
    });

    state = suggestionReducer(state, {
      type: 'STATUS_POLL_RESULT',
      status: 'sending'
    });
    expect(state.status).toBe('sending');
    expect(state.isPolling).toBe(true);

    state = suggestionReducer(state, {
      type: 'STATUS_POLL_RESULT',
      status: 'processing'
    });
    expect(state.status).toBe('processing');
    expect(state.isPolling).toBe(true);
  });

  it('handles payload wrapper in status_update alias', () => {
    let state = suggestionReducer(initialSuggestionState, {
      type: 'submitted',
      id: 'sug-payload'
    });

    state = suggestionReducer(state, {
      type: 'status_update',
      payload: {
        id: 'sug-payload',
        status: 'processing'
      }
    });

    expect(state.status).toBe('processing');
    expect(state.id).toBe('sug-payload');
  });

  it('handles retrying status with countdown', () => {
    let state = suggestionReducer(initialSuggestionState, {
      type: 'SUBMIT_SUCCESS',
      id: 'sug-retry'
    });

    state = suggestionReducer(state, {
      type: 'STATUS_POLL_RESULT',
      status: 'retrying',
      nextRetryInSeconds: 30
    });

    expect(state.status).toBe('retrying');
    expect(state.countdown).toBe(30);
    expect(state.nextRetryInSeconds).toBe(30);
    expect(state.isPolling).toBe(true);

    // Ticks countdown
    state = suggestionReducer(state, { type: 'COUNTDOWN_TICK' });
    expect(state.countdown).toBe(29);
    expect(state.nextRetryInSeconds).toBe(29);

    state = suggestionReducer(state, { type: 'tick_countdown' });
    expect(state.countdown).toBe(28);
  });

  it('does not decrement countdown below 0 or when not retrying', () => {
    let state: SuggestionState = {
      ...initialSuggestionState,
      status: 'retrying',
      countdown: 0,
      nextRetryInSeconds: 0
    };

    state = suggestionReducer(state, { type: 'COUNTDOWN_TICK' });
    expect(state.countdown).toBe(0);

    const idleState = suggestionReducer(initialSuggestionState, { type: 'COUNTDOWN_TICK' });
    expect(idleState.countdown).toBeUndefined();
  });

  it('stops polling when terminal confirmed status is reached', () => {
    let state = suggestionReducer(initialSuggestionState, {
      type: 'SUBMIT_SUCCESS',
      id: 'sug-conf'
    });

    state = suggestionReducer(state, {
      type: 'STATUS_POLL_RESULT',
      status: 'confirmed'
    });

    expect(state.status).toBe('confirmed');
    expect(state.isPolling).toBe(false);
    expect(state.isSubmitting).toBe(false);
  });

  it('stops polling and captures incidentId when terminal failed status is reached', () => {
    const uuid = 'a9b8c7d6-e5f4-3210-fedc-ba9876543210';
    let state = suggestionReducer(initialSuggestionState, {
      type: 'SUBMIT_SUCCESS',
      id: 'sug-fail'
    });

    state = suggestionReducer(state, {
      type: 'STATUS_POLL_RESULT',
      status: 'failed',
      incidentId: uuid,
      error: 'Excedido tiempo máximo de reintentos (5 minutos)'
    });

    expect(state.status).toBe('failed');
    expect(state.incidentId).toBe(uuid);
    expect(state.error).toBe('Excedido tiempo máximo de reintentos (5 minutos)');
    expect(state.isPolling).toBe(false);
  });

  it('handles POLL_ERROR with terminal flag', () => {
    let state = suggestionReducer(initialSuggestionState, {
      type: 'SUBMIT_SUCCESS',
      id: 'sug-poll-err'
    });

    // Transient error: state preserved
    state = suggestionReducer(state, {
      type: 'POLL_ERROR',
      error: 'Transient network failure'
    });
    expect(state.isPolling).toBe(true);

    // Terminal error: transitions to failed
    state = suggestionReducer(state, {
      type: 'POLL_ERROR',
      error: 'Too many consecutive poll errors',
      terminal: true
    });
    expect(state.status).toBe('failed');
    expect(state.isPolling).toBe(false);
    expect(state.error).toBe('Too many consecutive poll errors');
  });

  it('resets state on RESET action', () => {
    const activeState = {
      id: 'sug-reset',
      suggestionId: 'sug-reset',
      status: 'confirmed' as const,
      incidentId: undefined,
      error: undefined,
      countdown: undefined,
      nextRetryInSeconds: undefined,
      isSubmitting: false,
      isPolling: false
    };

    const resetState = suggestionReducer(activeState, { type: 'RESET' });
    expect(resetState).toEqual(initialSuggestionState);

    const resetLower = suggestionReducer(activeState, { type: 'reset' });
    expect(resetLower).toEqual(initialSuggestionState);
  });
});
