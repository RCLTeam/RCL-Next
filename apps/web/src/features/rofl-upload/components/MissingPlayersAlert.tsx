import React, { type CSSProperties } from 'react';

export interface MissingPlayersAlertProps {
  missingPlayers: string[];
  errorMessage?: string | null | undefined;
}

const styles: Record<string, CSSProperties> = {
  card: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    borderLeft: '4px solid #EF4444',
    borderRadius: '8px',
    padding: '1.5rem',
    marginBottom: '1.5rem'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.75rem'
  },
  icon: {
    width: '24px',
    height: '24px',
    stroke: '#EF4444',
    fill: 'none',
    flexShrink: 0
  },
  title: {
    margin: 0,
    fontSize: '1.15rem',
    fontWeight: 700,
    color: '#F87171'
  },
  description: {
    margin: '0 0 1rem 0',
    fontSize: '0.9rem',
    color: '#CBD5E1',
    lineHeight: 1.5
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginBottom: '1rem'
  },
  playerTag: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid rgba(239, 68, 68, 0.5)',
    color: '#FECACA',
    fontWeight: 700,
    fontSize: '0.85rem',
    padding: '0.35rem 0.75rem',
    borderRadius: '4px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  },
  actionNote: {
    margin: 0,
    fontSize: '0.8rem',
    color: '#94A3B8'
  }
};

export function MissingPlayersAlert({ missingPlayers, errorMessage }: MissingPlayersAlertProps) {
  if (missingPlayers.length === 0 && !errorMessage) {
    return null;
  }

  return (
    <div style={styles.card} role="alert">
      <div style={styles.header}>
        <svg
          style={styles.icon}
          viewBox="0 0 24 24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h3 style={styles.title}>Validation Aborted: Unregistered Players Detected</h3>
      </div>
      <p style={styles.description}>
        The entire batch ingestion was halted before persisting to the database. All match
        participants must be registered in the league database before match replays can be imported.
      </p>

      {missingPlayers.length > 0 && (
        <div style={styles.tagList}>
          {missingPlayers.map((player) => (
            <span key={player} style={styles.playerTag}>
              {player}
            </span>
          ))}
        </div>
      )}

      {errorMessage && (
        <p style={{ ...styles.description, color: '#FCA5A5', fontStyle: 'italic' }}>
          {errorMessage}
        </p>
      )}

      <p style={styles.actionNote}>
        Action required: Register these summoners in the administrative roster before retrying
        upload.
      </p>
    </div>
  );
}
