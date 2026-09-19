import type { BatchUploadSummary } from '@rcl/contracts';
import React from 'react';

export interface BatchSummaryCardProps {
  summary: BatchUploadSummary;
  onReset?: (() => void) | undefined;
}

export function BatchSummaryCard({ summary, onReset }: BatchSummaryCardProps) {
  const duplicatesCount = summary.skippedDuplicates?.length ?? 0;

  return (
    <div className="admin-batch-summary-card-card">
      <div className="admin-batch-summary-card-header">
        <div className="admin-batch-summary-card-title-group">
          <svg
            className="admin-batch-summary-card-icon"
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
            <h2 className="admin-batch-summary-card-title">Batch Ingestion Complete</h2>
            <p className="admin-batch-summary-card-subtitle">
              All replay data has been atomically validated and committed to the database.
            </p>
          </div>
        </div>

        {onReset && (
          <button type="button" className="admin-batch-summary-card-reset-button" onClick={onReset}>
            Upload Another Batch
          </button>
        )}
      </div>

      <div className="admin-batch-summary-card-stats-grid">
        <div className="admin-batch-summary-card-stat-box">
          <div className="admin-batch-summary-card-stat-value">{summary.processedGames}</div>
          <div className="admin-batch-summary-card-stat-label">Games Processed</div>
        </div>
        <div className="admin-batch-summary-card-stat-box">
          <div className="admin-batch-summary-card-stat-value">
            {summary.detectedDiscordUsersCount}
          </div>
          <div className="admin-batch-summary-card-stat-label">Discord Users</div>
        </div>
        <div className="admin-batch-summary-card-stat-box">
          <div className="admin-batch-summary-card-stat-value">{summary.detectedPlayersCount}</div>
          <div className="admin-batch-summary-card-stat-label">Registered Summoners</div>
        </div>
        <div className="admin-batch-summary-card-stat-box">
          <div
            className="admin-batch-summary-card-stat-value"
            style={{
              color: duplicatesCount > 0 ? 'var(--amber)' : 'var(--muted)'
            }}
          >
            {duplicatesCount}
          </div>
          <div className="admin-batch-summary-card-stat-label">Skipped Duplicates</div>
        </div>
      </div>

      {summary.skippedDuplicates && summary.skippedDuplicates.length > 0 && (
        <div className="admin-batch-summary-card-duplicates-section">
          <div className="admin-batch-summary-card-duplicates-title">
            Skipped Duplicate Match IDs:
          </div>
          <ul className="admin-batch-summary-card-duplicates-list">
            {summary.skippedDuplicates.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
