import type { BridgeHealthResponse } from '@rcl/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBridgeHealth } from '../api/bridge-api.js';
import type { UseBridgeHealthReturn } from '../types/bridge.types.js';

export { fetchBridgeHealth };

export function useBridgeHealth(): UseBridgeHealthReturn {
  const [data, setData] = useState<BridgeHealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const activeControllerRef = useRef<AbortController | null>(null);

  const refetch = useCallback(async (): Promise<void> => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const controller = new AbortController();
    activeControllerRef.current = controller;

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const result = await fetchBridgeHealth(controller.signal);
      if (isMountedRef.current && !controller.signal.aborted) {
        setData(result);
        setError(null);
      }
    } catch (err: unknown) {
      if (isMountedRef.current && !controller.signal.aborted) {
        setData(null);
        const message =
          err instanceof Error ? err.message : 'No se pudo conectar con el servicio de bridge.';
        setError(message);
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void refetch();

    return () => {
      isMountedRef.current = false;
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
        activeControllerRef.current = null;
      }
    };
  }, [refetch]);

  const isHealthy = data?.healthy ?? false;

  return {
    data,
    isHealthy,
    isLoading,
    error,
    refetch,
    // Convenience aliases
    healthy: isHealthy,
    status: data?.status ?? (isLoading ? 'loading' : 'unreachable'),
    message: data?.message ?? '',
    details: data?.details,
    loading: isLoading,
    checkHealth: async () => {
      await refetch();
      return (
        data ?? {
          status: 'unreachable',
          healthy: false,
          message: 'No se puede llegar a él'
        }
      );
    }
  };
}
