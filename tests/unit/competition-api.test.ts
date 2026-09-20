import { afterEach, expect, test, vi } from 'vitest';
import {
  getCollection,
  safeStreamUrl
} from '../../apps/web/src/features/competition/api/competition-api.js';

afterEach(() => vi.unstubAllGlobals());

test('Competition requests use the existing API envelope and cancellation signal', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'season-1' }] })));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  expect(await getCollection('seasons', controller.signal)).toEqual([{ id: 'season-1' }]);
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/seasons', {
    signal: controller.signal,
    credentials: 'include'
  });
});

test('HTTP and malformed responses remain errors instead of fake empty competitions', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Unavailable' } })));
  vi.stubGlobal('fetch', fetchMock);
  await expect(getCollection('seasons', new AbortController().signal)).rejects.toThrow(
    'could not be loaded'
  );
  await expect(getCollection('seasons', new AbortController().signal)).rejects.toThrow(
    'Invalid competition response'
  );
});

test('Stream links reject insecure non-localhost HTTP URLs in production', () => {
  expect(safeStreamUrl('https://www.twitch.tv/rcl')).toBe('https://www.twitch.tv/rcl');
  expect(safeStreamUrl('http://localhost:8080/stream')).toBe('http://localhost:8080/stream');
  expect(safeStreamUrl('http://127.0.0.1:8080/stream')).toBe('http://127.0.0.1:8080/stream');
  expect(safeStreamUrl('http://insecure-stream.com/live')).toBeUndefined();
  for (const value of [null, '', 'javascript:alert(1)', 'data:text/html,test', '/unknown']) {
    expect(safeStreamUrl(value)).toBeUndefined();
  }
});
