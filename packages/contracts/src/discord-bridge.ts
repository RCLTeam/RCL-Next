/**
 * WebSocket Bridge Health Probe and Protocol Frame Contracts
 * Module: @rcl/contracts/discord-bridge
 */

export type BridgeHealthStatus = 'connected' | 'unreachable' | 'authentication_failed';

export type BridgeHealthMessage =
  | 'Conexión correcta'
  | 'No se puede llegar a él'
  | 'No se pudo autenticar';

export interface BridgeHealthResponse {
  status: BridgeHealthStatus;
  healthy: boolean;
  message: BridgeHealthMessage;
  details?: string | undefined;
}

export interface BridgeQueuedFrame {
  type: 'QUEUED';
  data: {
    id: string;
  };
}

export interface BridgeRateLimitErrorFrame {
  type: 'ERROR';
  data: {
    id?: string | undefined;
    code: 'RATE_LIMITED';
    message?: string | undefined;
    retry_after_seconds: number;
  };
}

export interface BridgeLoginFrame {
  type: 'LOGIN';
  data: {
    id: string;
    token: string;
  };
}

export interface BridgeLoginSuccessFrame {
  type: 'LOGIN_SUCCESS';
  data: {
    id: string;
    status: 'ok';
  };
}

export interface BridgeSuggestionPayload {
  author_id?: string | undefined;
  author_username?: string | undefined;
  suggestion: string;
  avatar_url?: string | null | undefined;
  created_at?: string | undefined;
}

export interface BridgeSuggestionCreatedFrame {
  type: 'SUGGESTION_CREATED';
  data: {
    id: string;
    suggestion?: string | undefined;
    author_id?: string | undefined;
    author_username?: string | undefined;
    author_avatar?: string | null | undefined;
    content?: BridgeSuggestionPayload | undefined;
  };
}

export interface BridgeSuggestionConfirmedFrame {
  type: 'SUGGESTION_CONFIRMED';
  data: {
    id: string;
    channel_id: number | string;
    message_id: number | string;
    thread_id?: number | string | undefined;
  };
}

export interface BridgeSuggestionFailedFrame {
  type: 'SUGGESTION_FAILED';
  data: {
    id: string;
    code?: string | undefined;
    message?: string | undefined;
    reason?: string | undefined;
  };
}

export type BridgeServerFrame =
  | BridgeLoginSuccessFrame
  | BridgeQueuedFrame
  | BridgeRateLimitErrorFrame
  | BridgeSuggestionConfirmedFrame
  | BridgeSuggestionFailedFrame;

export type BridgeClientFrame = BridgeLoginFrame | BridgeSuggestionCreatedFrame;
