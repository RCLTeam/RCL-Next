import React from 'react';
import { RequireAdmin } from '../../../features/auth/components/RequireAdmin.js';
import { CrudOperationsPanel } from '../../../features/crud-operations/components/CrudOperationsPanel.js';
import { RoflUploadPanel } from '../../../features/rofl-upload/components/RoflUploadPanel.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import './admin.css';

export function AdminPage({
  wsUrl,
  path = '/admin'
}: { wsUrl?: string | undefined; path?: string }) {
  return (
    <section id="admin" className="admin-content" aria-label="Administración">
      <div className="admin-heading">
        <span className="eyebrow">Gestión de la competición</span>
        <h1>Admin</h1>
      </div>
      <RequireAdmin>
        <nav className="admin-navigation" aria-label="Funciones de administración">
          <SiteLink
            href="/admin/rofl/upload"
            aria-current={path === '/admin/rofl/upload' ? 'page' : undefined}
          >
            ROFL Upload
          </SiteLink>
          <SiteLink href="/admin/crud" aria-current={path === '/admin/crud' ? 'page' : undefined}>
            CRUD Operations
          </SiteLink>
        </nav>
        {path === '/admin/rofl/upload' ? (
          <RoflUploadPanel wsUrl={wsUrl} />
        ) : path === '/admin/crud' ? (
          <CrudOperationsPanel />
        ) : (
          <div className="admin-overview">
            <SiteLink href="/admin/rofl/upload">
              <span className="eyebrow">Estadísticas</span>
              <h2>ROFL Upload</h2>
              <p>Sube repeticiones de partidas para importar sus estadísticas automáticamente.</p>
              <span>Subir partidas →</span>
            </SiteLink>
            <SiteLink href="/admin/crud">
              <span className="eyebrow">Base de datos</span>
              <h2>CRUD Operations</h2>
              <p>
                Consulta, crea, edita y elimina los datos de la competición desde un único lugar.
              </p>
              <span>Gestionar datos →</span>
            </SiteLink>
          </div>
        )}
      </RequireAdmin>
    </section>
  );
}
