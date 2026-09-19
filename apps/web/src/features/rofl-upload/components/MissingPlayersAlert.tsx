import React from 'react';

export interface MissingPlayersAlertProps {
  missingPlayers: string[];
  errorMessage?: string | null | undefined;
}

export function MissingPlayersAlert({ missingPlayers, errorMessage }: MissingPlayersAlertProps) {
  if (missingPlayers.length === 0 && !errorMessage) {
    return null;
  }

  return (
    <div className="admin-missing-players-alert-card" role="alert">
      <div className="admin-missing-players-alert-header">
        <svg
          className="admin-missing-players-alert-icon"
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
        <h3 className="admin-missing-players-alert-title">
          Validation Aborted: Unregistered Players Detected
        </h3>
      </div>
      <p className="admin-missing-players-alert-description">
        The entire batch ingestion was halted before persisting to the database. All match
        participants must be registered in the league database before match replays can be imported.
      </p>

      {missingPlayers.length > 0 && (
        <div className="admin-missing-players-alert-tag-list">
          {missingPlayers.map((player) => (
            <span key={player} className="admin-missing-players-alert-player-tag">
              {player}
            </span>
          ))}
        </div>
      )}

      {errorMessage && (
        <p
          className="admin-missing-players-alert-description"
          style={{ color: 'var(--crimson)', fontStyle: 'italic' }}
        >
          {errorMessage}
        </p>
      )}

      <p className="admin-missing-players-alert-action-note">
        Action required: Register these summoners in the administrative roster before retrying
        upload.
      </p>
    </div>
  );
}
