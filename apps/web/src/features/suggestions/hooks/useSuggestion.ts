import type { CreateSuggestionRequest, SuggestionStatusResponse } from '@rcl/contracts';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { createSuggestion, getSuggestionStatus } from '../api/suggestions-api.js';
import { initialSuggestionState, suggestionReducer } from '../state/suggestion-reducer.js';
import type { UseSuggestionReturn } from '../types/suggestions.types.js';

const POLLING_INTERVAL_MS = 1000;
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

export function useSuggestion(): UseSuggestionReturn {
  const [state, dispatch] = useReducer(suggestionReducer, initialSuggestionState);

  const isMountedRef = useRef<boolean>(true);
  const activeControllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentSuggestionIdRef = useRef<string | null>(null);
  const consecutiveErrorsRef = useRef<number>(0);

  const stopTimers = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopTimers();
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
      activeControllerRef.current = null;
    }
    currentSuggestionIdRef.current = null;
    consecutiveErrorsRef.current = 0;
    dispatch({ type: 'RESET' });
  }, [stopTimers]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopTimers();
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
        activeControllerRef.current = null;
      }
    };
  }, [stopTimers]);

  const startPolling = useCallback(
    (id: string) => {
      currentSuggestionIdRef.current = id;
      consecutiveErrorsRef.current = 0;

      const pollTick = async () => {
        if (!isMountedRef.current || currentSuggestionIdRef.current !== id) {
          return;
        }

        const controller = new AbortController();
        activeControllerRef.current = controller;

        try {
          const statusRes: SuggestionStatusResponse = await getSuggestionStatus(
            id,
            controller.signal
          );

          if (!isMountedRef.current || currentSuggestionIdRef.current !== id) {
            return;
          }

          consecutiveErrorsRef.current = 0;
          dispatch({
            type: 'STATUS_POLL_RESULT',
            id: statusRes.id,
            status: statusRes.status,
            nextRetryInSeconds: statusRes.nextRetryInSeconds,
            incidentId: statusRes.incidentId,
            error: statusRes.error
          });

          // Estado terminal alcanzado: detener polling
          if (statusRes.status === 'confirmed' || statusRes.status === 'failed') {
            stopTimers();
            return;
          }

          // Programar siguiente ciclo de sondeo
          pollTimerRef.current = setTimeout(pollTick, POLLING_INTERVAL_MS);
        } catch (_pollErr: unknown) {
          if (!isMountedRef.current || currentSuggestionIdRef.current !== id) {
            return;
          }

          consecutiveErrorsRef.current += 1;
          if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_POLL_ERRORS) {
            stopTimers();
            dispatch({
              type: 'POLL_ERROR',
              error: 'Error persistente de conexión al consultar el estado.',
              terminal: true
            });
          } else {
            pollTimerRef.current = setTimeout(pollTick, POLLING_INTERVAL_MS);
          }
        }
      };

      pollTimerRef.current = setTimeout(pollTick, POLLING_INTERVAL_MS);
    },
    [stopTimers]
  );

  // Intervalo de decremento en tiempo real (1s) cuando status === 'retrying'
  useEffect(() => {
    const currentCountdown = state.countdown ?? state.nextRetryInSeconds;
    if (state.status === 'retrying' && currentCountdown !== undefined && currentCountdown > 0) {
      countdownTimerRef.current = setInterval(() => {
        dispatch({ type: 'COUNTDOWN_TICK' });
      }, 1000);

      return () => {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
      };
    }

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, [state.status, state.countdown, state.nextRetryInSeconds]);

  const submitSuggestion = useCallback(
    async (request: CreateSuggestionRequest): Promise<{ id: string }> => {
      stopTimers();
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }

      const controller = new AbortController();
      activeControllerRef.current = controller;

      dispatch({ type: 'SUBMIT_START' });

      try {
        const response = await createSuggestion(request, controller.signal);
        if (!isMountedRef.current) {
          return { id: response.id };
        }

        dispatch({
          type: 'SUBMIT_SUCCESS',
          id: response.id,
          suggestionId: response.id,
          status: response.status
        });

        startPolling(response.id);
        return { id: response.id };
      } catch (err: unknown) {
        if (isMountedRef.current) {
          const message = err instanceof Error ? err.message : 'Error al enviar la sugerencia.';
          dispatch({ type: 'SUBMIT_ERROR', error: message });
        }
        throw err;
      }
    },
    [startPolling, stopTimers]
  );

  return {
    id: state.id,
    suggestionId: state.suggestionId ?? state.id,
    status: state.status,
    incidentId: state.incidentId,
    error: state.error,
    countdown: state.countdown,
    nextRetryInSeconds: state.nextRetryInSeconds ?? state.countdown,
    isSubmitting: state.isSubmitting,
    isPolling: state.isPolling,
    submitSuggestion,
    submit: submitSuggestion,
    reset
  };
}
