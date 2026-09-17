import React, { type CSSProperties } from 'react';
import type { MultiAccountAnomaly } from '../types/upload.types.js';

export interface AnomalyAlertsProps {
  anomalies: MultiAccountAnomaly[];
}

const styles: Record<string, CSSProperties> = {
  container: {
    marginBottom: '1.5rem'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem'
  },
  icon: {
    width: '22px',
    height: '22px',
    stroke: '#FBBF24',
    fill: 'none',
    flexShrink: 0
  },
  title: {
    margin: 0,
    fontSize: '1.15rem',
    fontWeight: 700,
    color: '#FBBF24'
  },
  subtitle: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.85rem',
    color: '#94A3B8'
  },
  anomalyGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))'
  },
  card: {
    backgroundColor: '#161B26',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderLeft: '4px solid #F59E0B',
    borderRadius: '8px',
    padding: '1.25rem'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '0.75rem'
  },
  gameFile: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#F1F5F9',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  },
  discordTag: {
    fontSize: '0.8rem',
    color: '#94A3B8'
  },
  discordUser: {
    fontWeight: 700,
    color: '#FBBF24'
  },
  accountsList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  accountItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F131D',
    padding: '0.4rem 0.75rem',
    borderRadius: '4px',
    fontSize: '0.82rem',
    border: '1px solid #232D42'
  },
  accountName: {
    color: '#FFFFFF',
    fontWeight: 600
  },
  championBadge: {
    backgroundColor: 'rgba(123, 44, 255, 0.25)',
    border: '1px solid rgba(123, 44, 255, 0.5)',
    color: '#C4B5FD',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 700
  }
};

export function AnomalyAlerts({ anomalies }: AnomalyAlertsProps) {
  if (anomalies.length === 0) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <svg
          style={styles.icon}
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
          <h3 style={styles.title}>Multi-Account Detection Warnings ({anomalies.length})</h3>
          <p style={styles.subtitle}>
            The following participants were detected playing multiple accounts in the same match.
            These matches were persisted, but warrant administrative review.
          </p>
        </div>
      </div>

      <div style={styles.anomalyGrid}>
        {anomalies.map((item, idx) => (
          <div key={`${item.gameFile}-${item.discordUserId}-${idx}`} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.gameFile}>{item.gameFile}</span>
              <span style={styles.discordTag}>
                Discord: <strong style={styles.discordUser}>{item.discordUsername}</strong>
              </span>
            </div>
            <ul style={styles.accountsList}>
              {item.accounts.map((acc, aIdx) => (
                <li key={`${acc.account}-${aIdx}`} style={styles.accountItem}>
                  <span style={styles.accountName}>{acc.account}</span>
                  <span style={styles.championBadge}>{acc.champion}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
