import React from 'react';
import { RequireAdmin } from '../../auth/components/RequireAdmin.js';
import { RoflUploadPanel } from '../../rofl-upload/components/RoflUploadPanel.js';
import './admin.css';

export function AdminPage({ wsUrl }: { wsUrl?: string | undefined }) {
  return (
    <section id="admin" className="admin-content" aria-label="Administración">
      <div className="admin-heading">
        <span className="eyebrow">Gestión de la competición</span>
        <h1>Admin</h1>
      </div>
      <RequireAdmin>
        <RoflUploadPanel wsUrl={wsUrl} />
      </RequireAdmin>
    </section>
  );
}
