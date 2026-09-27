import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError } from '../../shared/app-error.js';
import { MAX_DATABASE_BACKUP_BYTES } from './database-transfer.service.js';

export interface PostgresBackupTools {
  exportDump(): Promise<Buffer>;
  readDump(backup: Buffer): Promise<{ data: string; exportedAt: string | null }>;
}
export class NativePostgresBackupTools implements PostgresBackupTools {
  constructor(
    private readonly databaseUrl: string,
    private readonly binDirectory = ''
  ) {}
  private run(tool: 'pg_dump' | 'pg_restore', args: string[], limit: number): Promise<Buffer> {
    const url = new URL(this.databaseUrl);
    const password = decodeURIComponent(url.password);
    url.password = '';
    url.searchParams.delete('password');
    const executable = this.binDirectory
      ? join(this.binDirectory, `${tool}${process.platform === 'win32' ? '.exe' : ''}`)
      : tool;
    return new Promise<Buffer>((resolve, reject) => {
      const child = spawn(
        executable,
        tool === 'pg_dump' ? [...args, '--no-password', `--dbname=${url.href}`] : args,
        {
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PGPASSWORD: password,
            PGCONNECT_TIMEOUT: '10',
            PGCLIENTENCODING: 'UTF8',
            LC_ALL: 'C'
          }
        }
      );
      const chunks: Buffer[] = [];
      let length = 0;
      let failure: AppError | undefined;
      const timeout = setTimeout(() => {
        failure = new AppError(504, 'BACKUP_TIMEOUT', 'The PostgreSQL backup operation timed out.');
        child.kill();
      }, 180000);
      child.stdout.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length > limit) {
          failure = new AppError(
            413,
            'BACKUP_TOO_LARGE',
            'The backup exceeds the web transfer limit.'
          );
          child.kill();
        } else chunks.push(chunk);
      });
      // Consume diagnostic output without exposing database names, credentials or row contents.
      child.stderr.on('data', () => {});
      child.on('error', () => {
        clearTimeout(timeout);
        reject(
          new AppError(
            503,
            'POSTGRES_TOOLS_UNAVAILABLE',
            'PostgreSQL backup tools are unavailable. Configure POSTGRES_BIN_DIR.'
          )
        );
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (failure) reject(failure);
        else if (code !== 0)
          reject(
            new AppError(
              tool === 'pg_restore' ? 422 : 502,
              tool === 'pg_restore' ? 'INVALID_BACKUP' : 'BACKUP_TOOL_FAILED',
              'PostgreSQL could not process this backup. Check tool compatibility and configuration.'
            )
          );
        else resolve(Buffer.concat(chunks));
      });
    }).catch((error: unknown) => {
      if (error instanceof AppError) throw error;
      throw new AppError(
        503,
        'POSTGRES_TOOLS_UNAVAILABLE',
        'PostgreSQL backup tools are unavailable. Configure POSTGRES_BIN_DIR.'
      );
    });
  }
  exportDump() {
    return this.run(
      'pg_dump',
      [
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        '--schema=public',
        '--schema=drizzle',
        '--no-publications',
        '--no-subscriptions',
        '--no-security-labels'
      ],
      MAX_DATABASE_BACKUP_BYTES
    );
  }
  async readDump(backup: Buffer) {
    if (backup.subarray(0, 5).toString('ascii') !== 'PGDMP')
      throw new AppError(
        422,
        'INVALID_BACKUP',
        'Only PostgreSQL custom-format .dump files are accepted.'
      );
    const directory = await mkdtemp(join(tmpdir(), 'rcl-database-transfer-'));
    try {
      const file = join(directory, 'backup.dump');
      await writeFile(file, backup, { mode: 0o600 });
      const list = (await this.run('pg_restore', ['--list', file], 2 * 1024 * 1024)).toString(
        'utf8'
      );
      const data = (
        await this.run(
          'pg_restore',
          ['--data-only', '--no-owner', '--no-privileges', '--file=-', file],
          128 * 1024 * 1024
        )
      ).toString('utf8');
      return { data, exportedAt: list.match(/^; Archive created at (.+)$/m)?.[1]?.trim() ?? null };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
