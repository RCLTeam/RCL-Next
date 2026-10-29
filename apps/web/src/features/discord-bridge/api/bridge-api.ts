import type { BridgeHealthResponse } from '../types/bridge.types.js';

/**
 * Consulta la sonda de salud del WebSocket Bridge expuesta por apps/api.
 * Tanto HTTP 200 (conectado) como HTTP 503 (unreachable / auth failed) devuelven
 * un payload JSON tipado como BridgeHealthResponse.
 */
export async function fetchBridgeHealth(
  optionsOrSignal?: { signal?: AbortSignal } | AbortSignal
): Promise<BridgeHealthResponse> {
  const signal = optionsOrSignal instanceof AbortSignal ? optionsOrSignal : optionsOrSignal?.signal;

  try {
    const response = await fetch('/api/v1/bridge/health', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      ...(signal ? { signal } : {})
    });

    if (response.status === 200 || response.status === 503) {
      const data = (await response.json()) as BridgeHealthResponse;
      return {
        ...data,
        message: data.message.replace(/[áéíóúÁÉÍÓÚ]/g, (letter) =>
          letter.normalize('NFD').slice(0, 1)
        )
      };
    }

    return {
      status: 'unreachable',
      healthy: false,
      message: 'No se puede llegar a el',
      details: `Respuesta inesperada del servidor de bridge (${response.status})`
    };
  } catch (err: unknown) {
    if (signal?.aborted) {
      throw err;
    }
    return {
      status: 'unreachable',
      healthy: false,
      message: 'No se puede llegar a el',
      details: err instanceof Error ? err.message : 'Error de conexion de red'
    };
  }
}
