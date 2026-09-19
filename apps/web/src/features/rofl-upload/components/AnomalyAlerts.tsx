import type { MultiAccountAnomaly } from '@rcl/contracts';
import React from 'react';

export interface AnomalyAlertsProps {
  anomalies: MultiAccountAnomaly[];
}

export function AnomalyAlerts({ anomalies }: AnomalyAlertsProps) {
  if (anomalies.length === 0) {
    return null;
  }

  return (
    <div className="admin-anomaly-alerts-container">
      <div className="admin-anomaly-alerts-header">
        <svg
          className="admin-anomaly-alerts-icon"
          viewBox="0 0 24 24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div>
          <h3 className="admin-anomaly-alerts-title">
            Multi-Account Detection Warnings ({anomalies.length})
          </h3>
          <p className="admin-anomaly-alerts-subtitle">
            The following participants were detected playing multiple accounts in the same match.
            These matches were persisted, but warrant administrative review.
          </p>
        </div>
      </div>

      <div className="admin-anomaly-alerts-anomaly-grid">
        {anomalies.map((item, idx) => (
          <div
            key={`${item.gameFile}-${item.discordUserId}-${idx}`}
            className="admin-anomaly-alerts-card"
          >
            <div className="admin-anomaly-alerts-card-header">
              <span className="admin-anomaly-alerts-game-file">{item.gameFile}</span>
              <span className="admin-anomaly-alerts-discord-tag">
                Discord:{' '}
                <strong className="admin-anomaly-alerts-discord-user">
                  {item.discordUsername}
                </strong>
              </span>
            </div>
            <ul className="admin-anomaly-alerts-accounts-list">
              {item.accounts.map((acc, aIdx) => (
                <li key={`${acc.account}-${aIdx}`} className="admin-anomaly-alerts-account-item">
                  <span className="admin-anomaly-alerts-account-name">{acc.account}</span>
                  <span className="admin-anomaly-alerts-champion-badge">{acc.champion}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
