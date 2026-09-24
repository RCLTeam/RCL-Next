import React from 'react';
import { RequireAdmin } from '../../../features/auth/components/RequireAdmin.js';
import { CrudOperationsPanel } from '../../../features/crud-operations/components/CrudOperationsPanel.js';
import { DatabaseTransferPanel } from '../../../features/database-transfer/components/DatabaseTransferPanel.js';
import { HomeContentPanel } from '../../../features/home-content/components/HomeContentPanel.js';
import { MemberRolesPanel } from '../../../features/member-roles/components/MemberRolesPanel.js';
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
            href="/admin/home-content"
            aria-current={path === '/admin/home-content' ? 'page' : undefined}
          >
            Home content
          </SiteLink>
          <SiteLink
            href="/admin/rofl/upload"
            aria-current={path === '/admin/rofl/upload' ? 'page' : undefined}
          >
            ROFL Upload
          </SiteLink>
          <SiteLink href="/admin/crud" aria-current={path === '/admin/crud' ? 'page' : undefined}>
            CRUD Operations
          </SiteLink>
          <SiteLink
            href="/admin/member-roles"
            aria-current={path === '/admin/member-roles' ? 'page' : undefined}
          >
            Roles Management
          </SiteLink>
          <SiteLink
            href="/admin/database-transfer"
            aria-current={path === '/admin/database-transfer' ? 'page' : undefined}
          >
            Database Transfer
          </SiteLink>
        </nav>
        {path === '/admin/home-content' ? (
          <HomeContentPanel />
        ) : path === '/admin/rofl/upload' ? (
          <RoflUploadPanel wsUrl={wsUrl} />
        ) : path === '/admin/crud' ? (
          <CrudOperationsPanel />
        ) : path === '/admin/member-roles' ? (
          <MemberRolesPanel />
        ) : path === '/admin/database-transfer' ? (
          <DatabaseTransferPanel />
        ) : (
          <div className="admin-overview">
            <SiteLink href="/admin/home-content">
              <span className="eyebrow">Publicación</span>
              <h2>Home content</h2>
              <p>
                Edita los quintetos por división y publica noticias, reportajes y entrevistas en la
                editorial.
              </p>
              <span>Gestionar contenido →</span>
            </SiteLink>
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
            <SiteLink href="/admin/member-roles">
              <span className="eyebrow">Miembros</span>
              <h2>Roles Management</h2>
              <p>
                Consulta los miembros y sus permisos de acceso. Los owners pueden gestionar sus
                roles.
              </p>
              <span>Ver miembros →</span>
            </SiteLink>
            <SiteLink href="/admin/database-transfer">
              <span className="eyebrow">Copias de seguridad</span>
              <h2>Database Transfer</h2>
              <p>Exporta un backup PostgreSQL. Los owners también pueden importar una copia.</p>
              <span>Importar o exportar →</span>
            </SiteLink>
          </div>
        )}
      </RequireAdmin>
    </section>
  );
}
