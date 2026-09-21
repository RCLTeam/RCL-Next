import type { CrudResource } from '@rcl/contracts';
import { afterEach, expect, it, vi } from 'vitest';
import {
  CrudDependenciesError,
  deleteCrudRecord,
  previewCrudDelete
} from './crud-operations-api.js';
const resource: CrudResource = {
  name: 'rounds',
  label: 'Jornadas',
  description: '',
  keys: ['id', 'idSeasonDivision'],
  fields: []
};
const record = {
  id: 1,
  idSeasonDivision: 'competition-id',
  updatedAt: '2026-09-21T12:00:00.000001Z'
};
afterEach(() => vi.unstubAllGlobals());
it('keeps the dependency list returned by a blocked deletion', async () => {
  const dependencies = [{ label: 'Encuentros', count: 2 }];
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'RELATED_RECORDS', details: { dependencies } } }),
          { status: 409 }
        )
      )
  );
  const error = await deleteCrudRecord(resource, record).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(CrudDependenciesError);
  expect(error).toMatchObject({ dependencies });
});
it('requests a preview without deleting and sends the reviewed token only on confirmation', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { confirmation: 'abc', allowed: true, impacts: [] } }))
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetcher);
  const signal = new AbortController().signal;
  const preview = await previewCrudDelete(resource, record, signal);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/crud-operations/rounds/delete-preview');
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    method: 'POST',
    signal,
    credentials: 'include'
  });
  await deleteCrudRecord(resource, record, preview.confirmation);
  const init = fetcher.mock.calls[1]?.[1];
  expect(init.method).toBe('DELETE');
  expect(JSON.parse(init.body)).toEqual({
    key: { id: 1, idSeasonDivision: 'competition-id' },
    version: record.updatedAt,
    cascadeConfirmation: 'abc'
  });
});
it('reports an obsolete deletion preview instead of silently retrying', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'DELETE_PREVIEW_CHANGED' } }), { status: 409 })
    );
  vi.stubGlobal('fetch', fetcher);
  await expect(deleteCrudRecord(resource, record, 'abc')).rejects.toThrow('vuelve a revisar');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
