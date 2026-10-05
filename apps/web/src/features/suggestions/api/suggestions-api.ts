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

  throw new Error(await readSubmitError(response));
}

const UNAVAILABLE_MESSAGE =
  'El servicio de sugerencias no está disponible en este momento. Inténtalo más tarde.';

/**
 * Traduce la respuesta de error de `POST /api/v1/suggestions` a un mensaje para
 * el modal. La API responde con `{ error: { code, message } }`.
 */
async function readSubmitError(response: Response): Promise<string> {
  let code: string | undefined;
  let message: string | undefined;
  try {
    const body = (await response.json()) as {
      message?: string;
      error?: string | { code?: string; message?: string };
    };
    if (typeof body?.error === 'object' && body.error !== null) {
      code = body.error.code;
      message = body.error.message;
    } else {
      message = body?.message ?? body?.error;
    }
  } catch {
    // Si no es JSON válido, se usa el mensaje genérico con el código HTTP
  }

  if (response.status === 429 || code === 'RATE_LIMITED') {
    const seconds = Number(response.headers.get('Retry-After'));
    const minutes = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : 0;
    return minutes > 0
      ? `Has enviado demasiadas sugerencias. Vuelve a intentarlo dentro de ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`
      : 'Has enviado demasiadas sugerencias. Vuelve a intentarlo más tarde.';
  }
  if (response.status === 503) {
    return UNAVAILABLE_MESSAGE;
  }
  return message || `Error al enviar la sugerencia (${response.status})`;
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
