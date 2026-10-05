import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn }));

const { NativePostgresBackupTools } = await import('./postgres-backup-tools.js');

describe('native PostgreSQL export', () => {
  beforeEach(() => {
    spawn.mockReset();
    spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn()
      });
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('PGDMP'));
        child.emit('close', 0);
      });
      return child;
    });
  });
  it('dumps the application schemas without session or OAuth state rows', async () => {
    const tools = new NativePostgresBackupTools('postgres://rcl:secret@localhost:5432/rcl');
    await expect(tools.exportDump()).resolves.toEqual(Buffer.from('PGDMP'));
    const [executable, args] = (spawn.mock.calls[0] ?? []) as [string, string[]];
    expect(executable).toBe('pg_dump');
    expect(args).toEqual(
      expect.arrayContaining([
        '--schema=public',
        '--schema=drizzle',
        '--exclude-table-data=public.auth_sessions',
        '--exclude-table-data=public.oauth_states'
      ])
    );
    expect(args.join(' ')).not.toContain('secret');
  });
});
