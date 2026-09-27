import type { SuggestionAction, SuggestionState } from '../types/suggestions.types.js';

export const initialSuggestionState: SuggestionState = {
  id: undefined,
  suggestionId: undefined,
  status: 'idle',
  incidentId: undefined,
  error: undefined,
  countdown: undefined,
  nextRetryInSeconds: undefined,
  isSubmitting: false,
  isPolling: false
};

export function suggestionReducer(
  state: SuggestionState,
  action: SuggestionAction
): SuggestionState {
  switch (action.type) {
    case 'SUBMIT_START':
    case 'submit_start':
      return {
        ...initialSuggestionState,
        status: 'idle',
        isSubmitting: true
      };

    case 'SUBMIT_SUCCESS':
    case 'submit_success':
    case 'submitted': {
      const id = action.id ?? action.suggestionId;
      const status = action.status ?? 'queued';
      return {
        ...state,
        id,
        suggestionId: id,
        status,
        isSubmitting: false,
        isPolling: true
      };
    }

    case 'SUBMIT_ERROR':
    case 'submit_error':
      return {
        ...state,
        status: 'failed',
        isSubmitting: false,
        isPolling: false,
        error: action.error
      };

    case 'STATUS_POLL_RESULT':
    case 'poll_update':
    case 'status_update': {
      const status = action.payload?.status ?? action.status ?? state.status;
      const nextRetry =
        action.payload?.nextRetryInSeconds ?? action.nextRetryInSeconds ?? action.countdown;
      const incidentId = action.payload?.incidentId ?? action.incidentId;
      const error = action.payload?.error ?? action.error;
      const id = action.payload?.id ?? action.id ?? action.suggestionId;

      const isTerminal = status === 'confirmed' || status === 'failed';
      return {
        ...state,
        id: id ?? state.id,
        suggestionId: id ?? state.suggestionId,
        status,
        isSubmitting: false,
        isPolling: !isTerminal,
        countdown: status === 'retrying' ? nextRetry : undefined,
        nextRetryInSeconds: status === 'retrying' ? nextRetry : undefined,
        incidentId: status === 'failed' ? incidentId : state.incidentId,
        error: status === 'failed' ? (error ?? 'La sugerencia no pudo ser procesada.') : state.error
      };
    }

    case 'POLL_ERROR':
    case 'poll_error':
      if (action.terminal) {
        return {
          ...state,
          status: 'failed',
          isSubmitting: false,
          isPolling: false,
          error: action.error
        };
      }
      return state;

    case 'COUNTDOWN_TICK':
    case 'tick_countdown': {
      const currentCountdown = state.countdown ?? state.nextRetryInSeconds;
      if (state.status === 'retrying' && currentCountdown !== undefined && currentCountdown > 0) {
        const nextVal = currentCountdown - 1;
        return {
          ...state,
          countdown: nextVal,
          nextRetryInSeconds: nextVal
        };
      }
      return state;
    }

    case 'RESET':
    case 'reset':
      return initialSuggestionState;

    default:
      return state;
  }
}
