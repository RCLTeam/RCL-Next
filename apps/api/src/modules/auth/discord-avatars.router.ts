import { Router } from 'express';

const TTL = 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;

interface Avatar {
  body: Buffer;
  contentType: string;
  expiresAt: number;
}

// Each app instance owns a bounded, temporary cache; nothing is stored on disk.
export function discordAvatarsRouter(fetchImage: typeof fetch = fetch): Router {
  const router = Router();
  const cache = new Map<string, Avatar>();
  const pending = new Map<string, Promise<Avatar>>();
  let cacheBytes = 0;

  function remove(key: string) {
    const entry = cache.get(key);
    if (entry) cacheBytes -= entry.body.length;
    cache.delete(key);
  }

  async function download(discordId: string, hash: string): Promise<Avatar> {
    const extension = hash.startsWith('a_') ? 'gif' : 'png';
    const response = await fetchImage(
      `https://cdn.discordapp.com/avatars/${discordId}/${hash}.${extension}?size=128`,
      { redirect: 'error', signal: AbortSignal.timeout(5000), credentials: 'omit' }
    );
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
    if (
      !response.ok ||
      contentType !== `image/${extension}` ||
      Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES ||
      !response.body
    ) {
      await response.body?.cancel();
      throw new Error('Invalid Discord avatar response');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_IMAGE_BYTES) throw new Error('Discord avatar is too large');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    if (bytes === 0) throw new Error('Empty Discord avatar');
    return { body: Buffer.concat(chunks), contentType, expiresAt: Date.now() + TTL };
  }

  router.get('/:discordId/:hash', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { discordId, hash } = req.params;
    if (!/^\d{17,20}$/.test(discordId) || !/^(a_)?[a-f0-9]{32}$/.test(hash)) {
      res.sendStatus(400);
      return;
    }
    const key = `${discordId}/${hash}`;
    for (const [cachedKey, entry] of cache) {
      if (entry.expiresAt <= Date.now()) remove(cachedKey);
    }
    try {
      let avatar = cache.get(key);
      if (!avatar) {
        let request = pending.get(key);
        if (!request) {
          if (pending.size >= 16) {
            res.sendStatus(503);
            return;
          }
          request = download(discordId, hash)
            .then((image) => {
              while (cache.size >= 256 || cacheBytes + image.body.length > MAX_CACHE_BYTES) {
                const oldest = cache.keys().next().value;
                if (oldest === undefined) break;
                remove(oldest);
              }
              cache.set(key, image);
              cacheBytes += image.body.length;
              return image;
            })
            .finally(() => pending.delete(key));
          pending.set(key, request);
        }
        avatar = await request;
      }
      // Only image headers are emitted. Upstream cookies and client credentials never pass through.
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('Content-Type', avatar.contentType);
      res.set('X-Content-Type-Options', 'nosniff');
      res.send(avatar.body);
    } catch {
      res.sendStatus(502);
    }
  });
  return router;
}
