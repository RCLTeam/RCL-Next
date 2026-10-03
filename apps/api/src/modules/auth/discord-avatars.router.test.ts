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
