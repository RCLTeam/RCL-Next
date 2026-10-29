import type {
  BridgeHealthResponse as ApiBridgeHealthResponse,
  BridgeHealthMessage,
  BridgeHealthStatus
} from '@rcl/contracts';

export type { BridgeHealthMessage, BridgeHealthStatus };

export type BridgeHealthResponse = Omit<ApiBridgeHealthResponse, 'message'> & { message: string };

export interface UseBridgeHealthReturn {
  data: BridgeHealthResponse | null;
  isHealthy: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  // Backward-compatible convenience aliases
  healthy?: boolean;
  status?: BridgeHealthStatus | 'loading';
  message?: BridgeHealthMessage | string;
  details?: string | undefined;
  loading?: boolean;
  checkHealth?: () => Promise<BridgeHealthResponse>;
}
