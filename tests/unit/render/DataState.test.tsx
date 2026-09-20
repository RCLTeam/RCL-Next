import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataState } from '../../../apps/web/src/shared/components/DataState.js';

describe('DataState rendering primitive', () => {
  it('renders loading message', () => {
    const html = renderToString(
      <DataState state={{ status: 'loading' }} loadingMessage="Cargando datos…">
        {(data) => <div>{data}</div>}
      </DataState>
    );
    expect(html).toContain('Cargando datos…');
    expect(html).toContain('class="empty-state"');
  });

  it('renders default loading message when none provided', () => {
    const html = renderToString(
      <DataState state={{ status: 'loading' }}>{(data: string) => <div>{data}</div>}</DataState>
    );
    expect(html).toContain('Cargando…');
  });

  it('renders error state with retry button', () => {
    const html = renderToString(
      <DataState state={{ status: 'error', error: 'Error del servidor' }} onRetry={() => {}}>
        {(data) => <div>{data}</div>}
      </DataState>
    );
    expect(html).toContain('Error del servidor');
    expect(html).toContain('Reintentar');
    expect(html).toContain('role="alert"');
  });

  it('renders error state with retry alias', () => {
    const html = renderToString(
      <DataState state={{ status: 'error', error: 'Fallo de conexión' }} retry={() => {}}>
        <div>Contenido</div>
      </DataState>
    );
    expect(html).toContain('Fallo de conexión');
    expect(html).toContain('Reintentar');
  });

  it('renders children with data when ready (function children)', () => {
    const html = renderToString(
      <DataState state={{ status: 'ready', data: 'Contenido disponible' }}>
        {(data) => <div>{data}</div>}
      </DataState>
    );
    expect(html).toContain('Contenido disponible');
  });

  it('renders children with data when ready (node children)', () => {
    const html = renderToString(
      <DataState state={{ status: 'ready', data: [1, 2, 3] }}>
        <div>Lista cargada</div>
      </DataState>
    );
    expect(html).toContain('Lista cargada');
  });

  it('renders empty message when ready with empty array', () => {
    const html = renderToString(
      <DataState state={{ status: 'ready', data: [] }} emptyMessage="No se encontraron elementos.">
        {(data: number[]) => <div>{data.length}</div>}
      </DataState>
    );
    expect(html).toContain('No se encontraron elementos.');
  });

  it('renders empty alias element when ready with empty array', () => {
    const html = renderToString(
      <DataState
        state={{ status: 'ready', data: [] }}
        empty={<span>Sin resultados personalizados</span>}
      >
        <div>Ignorado</div>
      </DataState>
    );
    expect(html).toContain('Sin resultados personalizados');
  });
});
