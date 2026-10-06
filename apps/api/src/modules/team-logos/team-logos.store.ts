import { lstat, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, notFound } from '../../shared/app-error.js';

export class TeamLogosStore {
  constructor(
    private readonly directory = fileURLToPath(
      new URL('../../../../web/public/images/teams_logo/', import.meta.url)
    )
  ) {}

  path(name: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}\.(png|jpe?g|webp)$/.test(name))
      throw new AppError(
        422,
        'INVALID_LOGO_NAME',
        'Usa un nombre con letras, números, guiones y extensión PNG, JPEG o WebP.'
      );
    return resolve(this.directory, name);
  }

  async file(name: string) {
    const path = this.path(name);
    const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') throw notFound('Logo');
      throw error;
    });
    if (!stat.isFile() || stat.isSymbolicLink()) throw notFound('Logo');
    return path;
  }

  async list() {
    await mkdir(this.directory, { recursive: true });
    const entries = await readdir(this.directory, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isFile() && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}\.(png|jpe?g|webp)$/.test(entry.name)
      )
      .map((entry) => ({ name: entry.name, url: `/api/v1/team-logos/images/${entry.name}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async save(name: string, body: unknown, type: string | undefined) {
    this.assertMutable(name);
    const path = this.path(name);
    if (!Buffer.isBuffer(body) || !body.length || body.length > 5 * 1024 * 1024)
      throw new AppError(422, 'INVALID_IMAGE', 'Selecciona una imagen de hasta 5 MB.');
    const valid =
      (name.endsWith('.png') &&
        type === 'image/png' &&
        body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
      (/\.jpe?g$/.test(name) &&
        type === 'image/jpeg' &&
        body.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) ||
      (name.endsWith('.webp') &&
        type === 'image/webp' &&
        body.toString('ascii', 0, 4) === 'RIFF' &&
        body.toString('ascii', 8, 12) === 'WEBP');
    if (!valid)
      throw new AppError(
        422,
        'INVALID_IMAGE',
        'El contenido y la extensión deben corresponder a una imagen PNG, JPEG o WebP.'
      );
    await mkdir(this.directory, { recursive: true });
    try {
      await writeFile(path, body, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new AppError(409, 'LOGO_EXISTS', 'Ya existe un logo con ese nombre.');
      throw error;
    }
    return { name, url: `/api/v1/team-logos/images/${name}` };
  }

  async remove(name: string) {
    this.assertMutable(name);
    await unlink(await this.file(name));
  }

  private assertMutable(name: string) {
    if (name.toLowerCase() === 'placeholder.webp')
      throw new AppError(
        403,
        'PROTECTED_LOGO',
        'El logo de reserva está protegido y no se puede modificar ni eliminar.'
      );
  }
}
