import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discordAvatarsRouter } from './discord-avatars.router.js';

const discordId = '123456789012345678';
const hash = '0123456789abcdef0123456789abcdef';
const path = `/avatars/${discordId}/${hash}`;

function setup() {
  const fetchImage = vi.fn<typeof fetch>();
  const app = express().use('/avatars', discordAvatarsRouter(fetchImage));
  return { app, fetchImage };
}

function avatarResponse(type = 'image/png') {
  return new Response(new Uint8Array([137, 80, 78, 71]), {
    headers: { 'content-type': type, 'set-cookie': '__cf_bm=secret; Secure' }
  });
}

afterEach(() => vi.useRealTimers());

describe('Discord avatar proxy', () => {
  it('shares concurrent downloads and releases capacity after failures', async () => {
    const { app, fetchImage } = setup();
    const downloads: Array<(response: Response) => void> = [];
    fetchImage.mockImplementation(() => new Promise((resolve) => downloads.push(resolve)));
    const requests = Array.from({ length: 16 }, (_, index) =>
      request(app)
        .get(`/avatars/${discordId}/${index.toString(16).padStart(32, '0')}`)
        .then((r) => r)
    );
    try {
      await vi.waitFor(() => expect(fetchImage).toHaveBeenCalledTimes(16));
      const duplicate = request(app)
        .get(`/avatars/${discordId}/${'0'.repeat(32)}`)
        .then((r) => r);
      const overloaded = await request(app).get(path).expect(503);
      expect(overloaded.headers['cache-control']).toBe('no-store');
      expect(fetchImage).toHaveBeenCalledTimes(16);
      for (const resolve of downloads) resolve(new Response('unavailable', { status: 503 }));
      const results = await Promise.all([...requests, duplicate]);
      expect(results.every((response) => response.status === 502)).toBe(true);
      fetchImage.mockResolvedValue(avatarResponse());
      await request(app).get(path).expect(200);
    } finally {
      for (const resolve of downloads) resolve(avatarResponse());
      await Promise.all(requests);
    }
  });

  it.each([
    { count: 257, bytes: 4 },
    { count: 17, bytes: 2 * 1024 * 1024 }
  ])('evicts old images when the cache limit is reached: %j', async ({ count, bytes }) => {
    const { app, fetchImage } = setup();
    fetchImage.mockImplementation(
      async () => new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/png' } })
    );
    const avatarPath = (index: number) =>
      `/avatars/${discordId}/${index.toString(16).padStart(32, '0')}`;
    for (let index = 0; index < count; index++) {
      await request(app).get(avatarPath(index)).expect(200);
    }
    await request(app)
      .get(avatarPath(count - 1))
      .expect(200);
    expect(fetchImage).toHaveBeenCalledTimes(count);
    await request(app).get(avatarPath(0)).expect(200);
    expect(fetchImage).toHaveBeenCalledTimes(count + 1);
  });

  it('cancels a chunked download as soon as its actual size exceeds the limit', async () => {
    const { app, fetchImage } = setup();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
        controller.enqueue(new Uint8Array(1024 * 1024));
        controller.enqueue(new Uint8Array(1));
      },
      cancel
    });
    fetchImage.mockResolvedValue(new Response(body, { headers: { 'content-type': 'image/png' } }));
    await request(app).get(path).expect(502);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    () => new Response(null, { headers: { 'content-type': 'image/png' } }),
    () => new Response(new Uint8Array(), { headers: { 'content-type': 'image/png' } }),
    () => avatarResponse('image/gif'),
    () =>
      new Response('oversized', {
        headers: { 'content-type': 'image/png', 'content-length': String(2 * 1024 * 1024 + 1) }
      })
  ])('rejects missing, empty, mismatched or oversized declared image bodies', async (response) => {
    const { app, fetchImage } = setup();
    fetchImage.mockResolvedValue(response());
    await request(app).get(path).expect(502).expect('Cache-Control', 'no-store');
  });
  it('serves and caches image bytes without forwarding cookies or credentials', async () => {
    const { app, fetchImage } = setup();
    fetchImage.mockResolvedValueOnce(avatarResponse());
    const response = await request(app).get(path).set('Cookie', 'session=private').expect(200);
    expect(response.body).toEqual(Buffer.from([137, 80, 78, 71]));
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(fetchImage).toHaveBeenCalledWith(
      `https://cdn.discordapp.com/avatars/${discordId}/${hash}.png?size=128`,
      { redirect: 'error', credentials: 'omit', signal: expect.any(AbortSignal) }
    );
    await request(app).get(path).expect(200);
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  it('preserves animated avatars', async () => {
    const { app, fetchImage } = setup();
    fetchImage.mockResolvedValueOnce(avatarResponse('image/gif'));
    await request(app)
      .get(`/avatars/${discordId}/a_${hash}`)
      .expect('Content-Type', /image\/gif/);
    expect(fetchImage.mock.calls[0]?.[0]).toContain(`a_${hash}.gif`);
  });

  it.each(['invalid/hash', `${discordId}/bad`, `${discordId}/${hash}.png`])(
    'rejects invalid avatar identifiers: %s',
    async (suffix) => {
      const { app, fetchImage } = setup();
      await request(app).get(`/avatars/${suffix}`).expect(400);
      expect(fetchImage).not.toHaveBeenCalled();
    }
  );

  it.each([
    () => new Response('redirect', { status: 302, headers: { location: 'http://localhost' } }),
    () => new Response('missing', { status: 404 }),
    () => new Response('<html>challenge</html>', { headers: { 'content-type': 'text/html' } }),
    () =>
      new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
        headers: { 'content-type': 'image/png' }
      })
  ])('rejects upstream errors and unsafe bodies without caching them', async (response) => {
    const { app, fetchImage } = setup();
    fetchImage.mockResolvedValueOnce(response()).mockResolvedValueOnce(avatarResponse());
    await request(app).get(path).expect(502).expect('Cache-Control', 'no-store');
    await request(app).get(path).expect(200);
    expect(fetchImage).toHaveBeenCalledTimes(2);
  });

  it('expires cached images after one hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { app, fetchImage } = setup();
    fetchImage.mockImplementation(async () => avatarResponse());
    await request(app).get(path).expect(200);
    vi.setSystemTime(Date.now() + 3_600_001);
    await request(app).get(path).expect(200);
    expect(fetchImage).toHaveBeenCalledTimes(2);
  });

  it('handles network failures', async () => {
    const { app, fetchImage } = setup();
    fetchImage.mockRejectedValueOnce(new Error('timeout'));
    await request(app).get(path).expect(502);
  });
});
