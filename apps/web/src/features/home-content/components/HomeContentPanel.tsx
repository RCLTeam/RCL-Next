import React, { useState } from 'react';
import { EditorialManager } from './EditorialManager.js';
import { WeeklyTeamManager } from './WeeklyTeamManager.js';
import './home-content-admin.css';

export function HomeContentPanel() {
  const [tab, setTab] = useState<'teams' | 'editorial'>('teams');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  function changeTab(value: typeof tab) {
    if (value === tab || busy) return;
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
    setDirty(false);
    setTab(value);
  }
  return (
    <div className="home-content-admin">
      <div className="content-manager-heading">
        <div>
          <span className="eyebrow">Publicación</span>
          <h2>Home content</h2>
          <p>Elige a los protagonistas de la jornada y cuenta las historias de RCL.</p>
        </div>
      </div>
      <div className="content-tabs" aria-label="Tipo de contenido">
        <button
          type="button"
          disabled={busy}
          aria-pressed={tab === 'teams'}
          onClick={() => changeTab('teams')}
        >
          Team of the Week
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={tab === 'editorial'}
          onClick={() => changeTab('editorial')}
        >
          Editorial
        </button>
      </div>
      {tab === 'teams' ? (
        <WeeklyTeamManager dirty={dirty} onDirty={setDirty} onBusy={setBusy} />
      ) : (
        <EditorialManager dirty={dirty} onDirty={setDirty} onBusy={setBusy} />
      )}
    </div>
  );
}

export interface EditorStateProps {
  dirty: boolean;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}
