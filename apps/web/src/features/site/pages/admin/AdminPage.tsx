import React from 'react';
import { RoflUploadPanel } from './components/RoflUploadPanel.js';
import './admin.css';

export function AdminPage({ wsUrl }: { wsUrl?: string | undefined }) {
  return (
    <section id="admin" className="admin-content" aria-label="Administración">
      <div className="admin-heading">
        <span className="eyebrow">Gestión de la competición</span>
        <h1>Admin</h1>
      </div>
      <RoflUploadPanel wsUrl={wsUrl} />
    </section>
  );
}
