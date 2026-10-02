import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppError, notFound } from '../../shared/app-error.js';

export class EditorialImageStore {
  private readonly directory: string;
  constructor(directory = process.env.EDITORIAL_IMAGE_DIR ?? 'data/editorial-images') {
    this.directory = resolve(directory);
  }
  path(name: string) {
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(name)) throw notFound('Image');
    return resolve(this.directory, name);
  }
  async remove(url: string) {
    const name = url.replace('/api/v1/home-content/images/', '');
    try {
      await unlink(this.path(name));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  async expiredUploads(now = Date.now()): Promise<string[]> {
    const entries = await readdir(this.directory, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    );
    const urls: string[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(entry.name)) continue;
      const stat = await lstat(this.path(entry.name)).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      // Unsaved uploads have a seven-day grace period. Persisted references are
      // checked under the repository's table lock before anything is removed.
      if (stat?.isFile() && now - stat.mtimeMs > 7 * 24 * 60 * 60 * 1000)
        urls.push(`/api/v1/home-content/images/${entry.name}`);
    }
    return urls;
  }
  async save(body: unknown, type: string | undefined) {
    if (!Buffer.isBuffer(body) || !body.length || body.length > 5 * 1024 * 1024)
      throw new AppError(422, 'INVALID_IMAGE', 'Choose an image up to 5 MiB.');
    const extension =
      type === 'image/png' && body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        ? 'png'
        : type === 'image/jpeg' && body.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
          ? 'jpg'
          : type === 'image/webp' &&
              body.toString('ascii', 0, 4) === 'RIFF' &&
              body.toString('ascii', 8, 12) === 'WEBP'
            ? 'webp'
            : null;
    if (!extension) throw new AppError(422, 'INVALID_IMAGE', 'Choose a PNG, JPEG or WebP image.');
    const name = `${randomUUID()}.${extension}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.path(name), body, { flag: 'wx' });
    return { url: `/api/v1/home-content/images/${name}` };
  }
}
