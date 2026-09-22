import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthContext } from '../../auth/components/AuthProvider.js';
import { DatabaseImportDialog, DatabaseTransferPanel } from './DatabaseTransferPanel.js';

describe('database transfer UI', () => {
  it.each(['admin', 'owner'] as const)(
    'allows exports for %s and hides import controls from admins',
    (role) => {
      const html = renderToStaticMarkup(
        <AuthContext.Provider
          value={{
            state: {
              status: 'authenticated',
              user: { discordId: '123', username: 'user', globalName: null, avatarHash: null, role }
            },
            signingOut: false,
            logoutError: false,
            retry: () => {},
            logout: async () => {}
          }}
        >
          <DatabaseTransferPanel />
        </AuthContext.Provider>
      );
      expect(html).toContain('Exportar .dump');
      if (role === 'owner') expect(html).toContain('type="file"');
      else {
        expect(html).not.toContain('type="file"');
        expect(html).not.toContain('Validar y revisar importación');
      }
    }
  );
  it('shows the affected tables and requires explicit typed confirmation', () => {
    const html = renderToStaticMarkup(
      <DatabaseImportDialog
        preview={{
          confirmation: 'a'.repeat(64),
          exportedAt: null,
          tables: [{ table: 'seasons', currentRows: 3, importedRows: 2 }]
        }}
        filename="backup.dump"
        busy={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(html).toContain('<dialog');
    expect(html).toContain('seasons');
    expect(html).toContain('backup.dump');
    expect(html).toContain('Escribe IMPORTAR');
    expect(html).toMatch(/disabled="">Confirmar importación/);
  });
});
