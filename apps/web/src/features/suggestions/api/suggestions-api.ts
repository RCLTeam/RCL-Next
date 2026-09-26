import type {
  CreateSuggestionRequest,
  CreateSuggestionResponse,
  SuggestionStatusResponse
} from '@rcl/contracts';

/**
 * Envía una sugerencia comunitaria a apps/api.
 * Requiere CSRF Origin match y credentials include.
 * Devuelve 202 Accepted con el ID y status 'queued'.
 */
export async function createSuggestion(
  request: CreateSuggestionRequest,
  optionsOrSignal?: { signal?: AbortSignal } | AbortSignal
): Promise<CreateSuggestionResponse> {
  const signal = optionsOrSignal instanceof AbortSignal ? optionsOrSignal : optionsOrSignal?.signal;

  const response = await fetch('/api/v1/suggestions', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request),
    ...(signal ? { signal } : {})
  });

  if (response.status === 202) {
    return (await response.json()) as CreateSuggestionResponse;
  }

  let errorMessage = `Error al enviar la sugerencia (${response.status})`;
  try {
    const errorBody = (await response.json()) as { message?: string; error?: string };
    if (errorBody?.message) {
      errorMessage = errorBody.message;
    } else if (errorBody?.error) {
      errorMessage = errorBody.error;
    }
  } catch {
    // Si no es JSON válido, se conserva el mensaje con código de estado HTTP
  }

  throw new Error(errorMessage);
}

/**
 * Consulta el estado de una sugerencia por ID.
 */
export async function getSuggestionStatus(
  id: string,
  optionsOrSignal?: { signal?: AbortSignal } | AbortSignal
): Promise<SuggestionStatusResponse> {
  const signal = optionsOrSignal instanceof AbortSignal ? optionsOrSignal : optionsOrSignal?.signal;

  const response = await fetch(`/api/v1/suggestions/status/${encodeURIComponent(id)}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    ...(signal ? { signal } : {})
  });

  if (response.status === 200) {
    return (await response.json()) as SuggestionStatusResponse;
  }

  let errorMessage = `No se pudo obtener el estado de la sugerencia (${response.status})`;
  try {
    const errorBody = (await response.json()) as { message?: string; error?: string };
    if (errorBody?.message) {
      errorMessage = errorBody.message;
    } else if (errorBody?.error) {
      errorMessage = errorBody.error;
    }
  } catch {
    // Si no es JSON válido, se conserva el mensaje con código de estado HTTP
  }

  throw new Error(errorMessage);
}
