import type { BatchUploadSummary } from '@rcl/contracts';
import React, { type CSSProperties } from 'react';

export interface BatchSummaryCardProps {
  summary: BatchUploadSummary;
  onReset?: (() => void) | undefined;
}

const styles: Record<string, CSSProperties> = {
  card: {
    backgroundColor: '#121622',
    border: '1px solid rgba(16, 185, 129, 0.4)',
    borderTop: '4px solid #10B981',
    borderRadius: '12px',
    padding: '2rem',
    marginBottom: '1.5rem',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
    flexWrap: 'wrap',
    gap: '1rem'
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  icon: {
    width: '28px',
    height: '28px',
    stroke: '#10B981',
    fill: 'none'
  },
  title: {
    margin: 0,
    fontSize: '1.35rem',
    fontWeight: 700,
    color: '#FFFFFF'
  },
  subtitle: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.85rem',
    color: '#94A3B8'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem'
  },
  statBox: {
    backgroundColor: '#181E2E',
    border: '1px solid #28334E',
    borderRadius: '8px',
    padding: '1.25rem',
    textAlign: 'center'
  },
  statValue: {
    fontSize: '1.75rem',
    fontWeight: 800,
    color: '#F4FF3A',
    lineHeight: 1.2
  },
  statLabel: {
    marginTop: '0.35rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  duplicatesSection: {
    backgroundColor: '#151B28',
    border: '1px solid #232D42',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1.5rem'
  },
  duplicatesTitle: {
    margin: '0 0 0.5rem 0',
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#E2E8F0'
  },
  duplicatesList: {
    margin: 0,
    paddingLeft: '1.25rem',
    fontSize: '0.8rem',
    color: '#94A3B8',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '1rem'
  },
  resetButton: {
    backgroundColor: '#7B2CFF',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    padding: '0.65rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem'
  }
};

export function BatchSummaryCard({ summary, onReset }: BatchSummaryCardProps) {
  const duplicatesCount = summary.skippedDuplicates?.length ?? 0;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <svg
            style={styles.icon}
            viewBox="0 0 24 24"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <div>
            <h2 style={styles.title}>Batch Ingestion Complete</h2>
            <p style={styles.subtitle}>
              All replay data has been atomically validated and committed to the database.
            </p>
          </div>
        </div>

        {onReset && (
          <button type="button" style={styles.resetButton} onClick={onReset}>
            Upload Another Batch
          </button>
        )}
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statBox}>
          <div style={styles.statValue}>{summary.processedGames}</div>
          <div style={styles.statLabel}>Games Processed</div>
        </div>
        <div style={styles.statBox}>
          <div style={styles.statValue}>{summary.detectedDiscordUsersCount}</div>
          <div style={styles.statLabel}>Discord Users</div>
        </div>
        <div style={styles.statBox}>
          <div style={styles.statValue}>{summary.detectedPlayersCount}</div>
          <div style={styles.statLabel}>Registered Summoners</div>
        </div>
        <div style={styles.statBox}>
          <div
            style={{
              ...styles.statValue,
              color: duplicatesCount > 0 ? '#FBBF24' : '#64748B'
            }}
          >
            {duplicatesCount}
          </div>
          <div style={styles.statLabel}>Skipped Duplicates</div>
        </div>
      </div>

      {summary.skippedDuplicates && summary.skippedDuplicates.length > 0 && (
        <div style={styles.duplicatesSection}>
          <div style={styles.duplicatesTitle}>Skipped Duplicate Match IDs:</div>
          <ul style={styles.duplicatesList}>
            {summary.skippedDuplicates.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
