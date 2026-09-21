import { AppError } from '../../shared/app-error.js';

const invalid = () =>
  new AppError(
    422,
    'INCOMPATIBLE_BACKUP',
    'The dump must contain complete COPY data for the current RCL schema.'
  );
export function decodeCopyValue(value: string): string | null {
  if (value === '\\N') return null;
  return value.replace(/\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|.)/g, (_match, escaped: string) => {
    const controls: Record<string, string> = {
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
      '\\': '\\'
    };
    if (/^[0-7]/.test(escaped)) return String.fromCharCode(Number.parseInt(escaped, 8));
    if (escaped.startsWith('x') && escaped.length > 1)
      return String.fromCharCode(Number.parseInt(escaped.slice(1), 16));
    return controls[escaped] ?? escaped;
  });
}

// Extract only COPY payloads from pg_restore output. Never execute SQL or psql commands
// supplied by a dump (functions, triggers, extensions and permissions remain local).
export function parseCopyBackup(source: string, expected: Record<string, string[]>) {
  const result: Record<string, Record<string, string | null>[]> = {};
  let current: { name: string; columns: string[] } | undefined;
  for (const line of source.split('\n')) {
    const text = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (current) {
      if (text === '\\.') {
        current = undefined;
        continue;
      }
      const values = text.split('\t');
      if (values.length !== current.columns.length) throw invalid();
      const row: Record<string, string | null> = {};
      for (const [index, column] of current.columns.entries())
        row[column] = decodeCopyValue(values[index] ?? '');
      result[current.name]?.push(row);
      continue;
    }
    if (!text.startsWith('COPY ')) continue;
    const match =
      /^COPY (?:"?(public|drizzle)"?)\."?([a-z_][a-z0-9_]*)"? \((.+)\) FROM stdin;$/.exec(text);
    if (!match) throw invalid();
    const name = `${match[1]}.${match[2]}`;
    const columns = (match[3] ?? '').split(', ').map((column) => column.replace(/^"|"$/g, ''));
    if (
      !Object.hasOwn(expected, name) ||
      Object.hasOwn(result, name) ||
      [...columns].sort().join(',') !== [...(expected[name] ?? [])].sort().join(',')
    )
      throw invalid();
    result[name] = [];
    current = { name, columns };
  }
  if (current || Object.keys(result).sort().join(',') !== Object.keys(expected).sort().join(','))
    throw invalid();
  return result;
}
