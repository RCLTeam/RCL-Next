import React, { type CSSProperties } from 'react';
import { AnomalyAlerts } from '../components/AnomalyAlerts.js';
import { BatchSummaryCard } from '../components/BatchSummaryCard.js';
import { MissingPlayersAlert } from '../components/MissingPlayersAlert.js';
import { RoflDropzone } from '../components/RoflDropzone.js';
import { UploadStepper } from '../components/UploadStepper.js';
import { useRoflUploadWs } from '../hooks/useRoflUploadWs.js';

export interface RoflUploadPageProps {
  wsUrl?: string | undefined;
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    width: '100%'
  },
  headerCard: {
    backgroundColor: '#151A26',
    border: '1px solid rgba(123, 44, 255, 0.4)',
    borderLeft: '4px solid #F4FF3A',
    borderRadius: '8px',
    padding: '1.5rem 2rem'
  },
  title: {
    margin: 0,
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#FFFFFF',
    letterSpacing: '-0.02em'
  },
  subtitle: {
    marginTop: '0.5rem',
    marginBottom: 0,
    color: '#94A3B8',
    fontSize: '0.95rem'
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #EF4444',
    borderRadius: '8px',
    padding: '1.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    flexWrap: 'wrap'
  },
  errorText: {
    margin: 0,
    color: '#F87171',
    fontWeight: 600,
    fontSize: '0.95rem'
  },
  retryButton: {
    backgroundColor: '#EF4444',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    padding: '0.5rem 1rem',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '0.85rem'
  }
};

export function RoflUploadPage({ wsUrl }: RoflUploadPageProps) {
  const { state, uploadFile, reset } = useRoflUploadWs({ wsUrl });

  const isIdle = state.stage === 'idle';
  const isError = state.stage === 'error';
  const isCompleted = state.stage === 'completed';

  return (
    <div style={styles.container}>
      <section style={styles.headerCard}>
        <h1 style={styles.title}>ROFL Replay Upload</h1>
        <p style={styles.subtitle}>
          Administrative batch ingestion workspace for League of Legends match replays.
        </p>
      </section>

      {/* Dropzone rendered when idle, or when finished/errored if user wants to select another */}
      {isIdle ? (
        <RoflDropzone onFileSelected={uploadFile} />
      ) : (
        <>
          <UploadStepper
            stage={state.stage}
            progress={state.progress}
            queuePosition={state.queuePosition}
            queueTotal={state.queueTotal}
            terminalLogs={state.terminalLogs}
            fileName={state.fileName}
          />

          {isError && (
            <>
              <div style={styles.errorBanner} role="alert">
                <p style={styles.errorText}>
                  {state.errorMessage ?? 'Upload aborted due to an unexpected error.'}
                </p>
                <button type="button" style={styles.retryButton} onClick={reset}>
                  Reset &amp; Retry
                </button>
              </div>

              {state.missingPlayers.length > 0 && (
                <MissingPlayersAlert
                  missingPlayers={state.missingPlayers}
                  errorMessage={state.errorMessage}
                />
              )}
            </>
          )}

          {state.anomalies.length > 0 && <AnomalyAlerts anomalies={state.anomalies} />}

          {isCompleted && state.summary && (
            <BatchSummaryCard summary={state.summary} onReset={reset} />
          )}
        </>
      )}
    </div>
  );
}
