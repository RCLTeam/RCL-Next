import type { CrudDeletePreview, CrudResource } from '@rcl/contracts';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CrudDeleteDialog, CrudDeleteImpactTable } from './CrudDeleteDialog.js';

const resource: CrudResource = {
  name: 'seasons',
  label: 'Temporadas',
  description: '',
  keys: ['name'],
  fields: []
};
describe('CRUD deletion confirmation', () => {
  it('renders a modal and disables owner confirmation until the preview is reviewed', () => {
    const html = renderToString(
      <CrudDeleteDialog
        resource={resource}
        record={{ name: 'Liga' }}
        owner
        onCancel={() => {}}
        onDeleted={() => {}}
      />
    );
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-describedby="crud-delete-warning"');
    expect(html).toContain('Calculando filas afectadas');
    expect(html).toMatch(/disabled="">Confirmar eliminación en cascada/);
    expect(html).toContain('irreversible');
  });
  it('keeps ordinary admin deletion and explains the dependency restriction', () => {
    const html = renderToString(
      <CrudDeleteDialog
        resource={resource}
        record={{ name: 'Liga' }}
        owner={false}
        onCancel={() => {}}
        onDeleted={() => {}}
      />
    );
    expect(html).toContain('Solo un owner puede borrar en cascada');
    expect(html).not.toContain('Confirmar eliminación en cascada');
    expect(html).not.toContain('Calculando filas afectadas');
  });
  it('shows per-table counts and distinguishes deleted rows, unlinked rows and blockers', () => {
    const preview: CrudDeletePreview = {
      confirmation: 'a'.repeat(64),
      allowed: false,
      impacts: [
        { table: 'teams', action: 'delete', count: 2, examples: [{ id: 'team-a' }] },
        { table: 'matches', action: 'set-null', count: 3, examples: [{ id: 'match-a' }] },
        { table: 'predictions', action: 'blocked', count: 1, examples: [{ id: 'prediction-a' }] }
      ]
    };
    const html = renderToString(<CrudDeleteImpactTable preview={preview} />);
    expect(html.replaceAll('<!-- -->', '')).toContain('2 filas que se eliminarán');
    for (const content of [
      'teams',
      'team-a',
      'matches',
      'predictions',
      'Desvincular (no se eliminan)',
      'Bloquea el borrado'
    ])
      expect(html).toContain(content);
  });
});
