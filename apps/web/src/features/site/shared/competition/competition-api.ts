export async function getCollection<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(`/api/v1/${path}`, { signal, credentials: 'include' });
  if (!response.ok) throw new Error('Competition data could not be loaded.');
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('data' in body) || !Array.isArray(body.data)) {
    throw new Error('Invalid competition response.');
  }
  return body.data as T[];
}

export function safeStreamUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
