import React from 'react';

export function MatchSectionTabs({
  section,
  onSelect
}: { section: string; onSelect: (id: string) => void }) {
  return (
    <div className="match-section-nav" role="tablist" aria-label="Secciones del partido">
      {(['enfrentamientos', 'estadisticas', 'runas'] as const).map((id, index, tabs) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`tab-${id}`}
          aria-selected={section === id}
          aria-controls={id}
          tabIndex={section === id ? 0 : -1}
          onClick={() => onSelect(id)}
          onKeyDown={(event) => {
            const next =
              event.key === 'ArrowRight'
                ? (index + 1) % tabs.length
                : event.key === 'ArrowLeft'
                  ? (index + tabs.length - 1) % tabs.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : -1;
            if (next >= 0) {
              event.preventDefault();
              const target = tabs[next];
              if (target) {
                onSelect(target);
                document.getElementById(`tab-${target}`)?.focus();
              }
            }
          }}
        >
          {['Enfrentamiento', 'Estadísticas', 'Runas'][index]}
        </button>
      ))}
    </div>
  );
}
