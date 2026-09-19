import './rofl-upload.css';
import React from 'react';
import { useRoflUploadWs } from '../hooks/useRoflUploadWs.js';
import { AnomalyAlerts } from './AnomalyAlerts.js';
import { BatchSummaryCard } from './BatchSummaryCard.js';
import { MissingPlayersAlert } from './MissingPlayersAlert.js';
import { RoflDropzone } from './RoflDropzone.js';
import { UploadStepper } from './UploadStepper.js';

export interface RoflUploadPanelProps {
  wsUrl?: string | undefined;
}

export function RoflUploadPanel({ wsUrl }: RoflUploadPanelProps) {
  const { state, uploadFile, reset } = useRoflUploadWs({ wsUrl });

  const isIdle = state.stage === 'idle';
  const isError = state.stage === 'error';
  const isCompleted = state.stage === 'completed';

  return (
    <div className="admin-rofl-upload-panel-container">
      <section className="admin-rofl-upload-panel-header-card">
        <h2 className="admin-rofl-upload-panel-title">ROFL Replay Upload</h2>
        <p className="admin-rofl-upload-panel-subtitle">
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
              <div className="admin-rofl-upload-panel-error-banner" role="alert">
                <p className="admin-rofl-upload-panel-error-text">
                  {state.errorMessage ?? 'Upload aborted due to an unexpected error.'}
                </p>
                <button
                  type="button"
                  className="admin-rofl-upload-panel-retry-button"
                  onClick={reset}
                >
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
