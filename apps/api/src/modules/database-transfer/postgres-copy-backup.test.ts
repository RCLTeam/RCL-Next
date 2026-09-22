import { describe, expect, it } from 'vitest';
import { decodeCopyValue, parseCopyBackup } from './postgres-copy-backup.js';
describe('native PostgreSQL COPY decoding', () => {
  it('preserves nulls, escaped delimiters, Unicode and literal backslashes', () => {
    expect(decodeCopyValue('\\N')).toBeNull();
    expect(decodeCopyValue('\\\\N')).toBe('\\N');
    expect(decodeCopyValue('ñ\\tline\\n\\r\\\\end')).toBe('ñ\tline\n\r\\end');
    expect(decodeCopyValue('\\101\\x42')).toBe('AB');
  });
  it('extracts only whitelisted COPY rows and never executes statements', () => {
    expect(
      parseCopyBackup(
        'DROP TABLE public.seasons;\nCOPY public.seasons (name) FROM stdin;\nLeague\\tname\n\\.\n\\! rm\n',
        { 'public.seasons': ['name'] }
      )
    ).toEqual({ 'public.seasons': [{ name: 'League\tname' }] });
  });
  it.each([
    'COPY public.unknown (name) FROM stdin;\n\\.\n',
    'COPY public.seasons (extra) FROM stdin;\n\\.\n',
    'COPY public.seasons (name) FROM stdin;\nmissing terminator',
    'COPY public.seasons (name) FROM stdin;\na\tb\n\\.\n',
    'COPY public.seasons (name) FROM stdin;\n\\.\nCOPY public.seasons (name) FROM stdin;\n\\.\n'
  ])('rejects incompatible or truncated COPY data', (source) =>
    expect(() => parseCopyBackup(source, { 'public.seasons': ['name'] })).toThrow()
  );
});
