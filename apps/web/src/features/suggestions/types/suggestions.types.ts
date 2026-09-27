import type {
  CreateSuggestionRequest,
  CreateSuggestionResponse,
  SuggestionStatus,
  SuggestionStatusResponse
} from '@rcl/contracts';

export type {
  CreateSuggestionRequest,
  CreateSuggestionResponse,
  SuggestionStatus,
  SuggestionStatusResponse
};

export type SuggestionUIStatus = SuggestionStatus | 'idle';

export interface SuggestionState {
  id?: string | undefined;
  suggestionId?: string | undefined;
  status: SuggestionUIStatus;
  incidentId?: string | undefined;
  error?: string | undefined;
  countdown?: number | undefined;
  nextRetryInSeconds?: number | undefined;
  isSubmitting: boolean;
  isPolling: boolean;
}

export type SuggestionAction =
  | { type: 'SUBMIT_START' | 'submit_start' }
  | {
      type: 'SUBMIT_SUCCESS' | 'submit_success' | 'submitted';
      id?: string;
      suggestionId?: string;
      status?: SuggestionStatus;
    }
  | { type: 'SUBMIT_ERROR' | 'submit_error'; error: string }
  | {
      type: 'STATUS_POLL_RESULT' | 'poll_update' | 'status_update';
      id?: string;
      suggestionId?: string;
      status?: SuggestionStatus;
      nextRetryInSeconds?: number | undefined;
      countdown?: number | undefined;
      incidentId?: string | undefined;
      error?: string | undefined;
      payload?: {
        id?: string;
        status: SuggestionStatus;
        nextRetryInSeconds?: number | undefined;
        incidentId?: string | undefined;
        error?: string | undefined;
      };
    }
  | { type: 'POLL_ERROR' | 'poll_error'; error: string; terminal?: boolean }
  | { type: 'COUNTDOWN_TICK' | 'tick_countdown' }
  | { type: 'RESET' | 'reset' };

export interface UseSuggestionReturn {
  id?: string | undefined;
  suggestionId?: string | undefined;
  status: SuggestionUIStatus;
  incidentId?: string | undefined;
  error?: string | undefined;
  countdown?: number | undefined;
  nextRetryInSeconds?: number | undefined;
  isSubmitting: boolean;
  isPolling: boolean;
  submitSuggestion: (req: CreateSuggestionRequest) => Promise<{ id: string }>;
  submit?: (req: CreateSuggestionRequest) => Promise<undefined | { id: string }>;
  reset: () => void;
}
