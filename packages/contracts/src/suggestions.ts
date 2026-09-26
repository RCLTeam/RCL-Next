/**
 * Community Suggestions DTOs and Status Contracts
 * Module: @rcl/contracts/suggestions
 */

export type SuggestionStatus =
  | 'queued'
  | 'sending'
  | 'processing'
  | 'retrying'
  | 'confirmed'
  | 'failed';

export interface CreateSuggestionRequest {
  suggestion: string;
  isAnonymous?: boolean | undefined;
}

export interface CreateSuggestionResponse {
  id: string;
  status: SuggestionStatus;
}

export interface SuggestionStatusResponse {
  id: string;
  status: SuggestionStatus;
  nextRetryInSeconds?: number | undefined;
  incidentId?: string | undefined;
  error?: string | undefined;
}
