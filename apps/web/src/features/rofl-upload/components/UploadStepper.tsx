import React, { useEffect, useRef } from 'react';
import type { UploadStage } from '../types/upload.types.js';

export interface UploadStepperProps {
  stage: UploadStage;
  progress: number;
  queuePosition: number | null;
  queueTotal: number | null;
  terminalLogs: string[];
  fileName?: string | null | undefined;
}

interface StepDefinition {
  key: string;
  label: string;
  stageKey: UploadStage;
}

const PRIMARY_STEPS: StepDefinition[] = [
  { key: 'uploading', label: 'Upload', stageKey: 'uploading' },
  { key: 'decompressing', label: 'Decompress', stageKey: 'decompressing' },
  { key: 'parsing', label: 'Parse ROFL', stageKey: 'parsing' },
  { key: 'validating', label: 'Validate', stageKey: 'validating' },
  { key: 'persisting', label: 'Persist', stageKey: 'persisting' },
  { key: 'completed', label: 'Completed', stageKey: 'completed' }
];

const STAGE_ORDER: Record<UploadStage, number> = {
  idle: 0,
  uploading: 1,
  queue: 2,
  decompressing: 2,
  parsing: 3,
  validating: 4,
  persisting: 5,
  completed: 6,
  error: 99
};

export function UploadStepper({
  stage,
  progress,
  queuePosition,
  queueTotal,
  terminalLogs,
  fileName
}: UploadStepperProps) {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalLogs.length > 0) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs]);

  const currentOrder = STAGE_ORDER[stage] ?? 0;
  const isQueueActive = stage === 'queue' && queuePosition !== null;

  return (
    <div className="admin-upload-stepper-container">
      <div className="admin-upload-stepper-header">
        <h3 className="admin-upload-stepper-file-title">
          {fileName ? `Replay Batch: ${fileName}` : 'Ingestion Pipeline'}
        </h3>
        <span
          className="admin-upload-stepper-stage-badge"
          style={{
            backgroundColor:
              stage === 'completed'
                ? 'color-mix(in srgb, var(--win) 20%, transparent)'
                : stage === 'error'
                  ? 'color-mix(in srgb, var(--crimson) 20%, transparent)'
                  : stage === 'queue'
                    ? 'color-mix(in srgb, var(--lime) 20%, transparent)'
                    : 'color-mix(in srgb, var(--purple) 20%, transparent)',
            color:
              stage === 'completed'
                ? 'var(--win)'
                : stage === 'error'
                  ? 'var(--crimson)'
                  : stage === 'queue'
                    ? 'var(--lime)'
                    : 'var(--text)',
            border: `1px solid ${
              stage === 'completed'
                ? 'var(--win)'
                : stage === 'error'
                  ? 'var(--crimson)'
                  : stage === 'queue'
                    ? 'var(--lime)'
                    : 'var(--purple)'
            }`
          }}
        >
          {stage}
        </span>
      </div>

      {isQueueActive && (
        <div className="admin-upload-stepper-queue-alert">
          <p className="admin-upload-stepper-queue-text">
            Decompression Queue Active &bull; Server is currently decompressing another archive.
          </p>
          <span className="admin-upload-stepper-queue-badge">
            Position {queuePosition} of {queueTotal}
          </span>
        </div>
      )}

      {/* Progress Track */}
      <div className="admin-upload-stepper-stepper-track">
        {PRIMARY_STEPS.map((step, index) => {
          const stepOrder = STAGE_ORDER[step.stageKey];
          const isDone = currentOrder > stepOrder || stage === 'completed';
          const isCurrent =
            stage === step.stageKey || (step.key === 'decompressing' && stage === 'queue');
          const isErrorStep = stage === 'error' && index === Math.max(0, currentOrder - 1);

          let circleBg = 'var(--panel-raised)';
          let circleColor = 'var(--muted)';
          let circleBorder = '1px solid var(--stone)';
          let labelColor = 'var(--muted)';

          if (isDone) {
            circleBg = 'var(--win)';
            circleColor = 'var(--text)';
            circleBorder = '1px solid var(--win)';
            labelColor = 'var(--win)';
          } else if (isCurrent) {
            circleBg = 'var(--purple)';
            circleColor = 'var(--lime)';
            circleBorder = '2px solid var(--lime)';
            labelColor = 'var(--text)';
          } else if (isErrorStep) {
            circleBg = 'var(--crimson)';
            circleColor = 'var(--text)';
            circleBorder = '1px solid var(--crimson)';
            labelColor = 'var(--crimson)';
          }

          return (
            <div key={step.key} className="admin-upload-stepper-step-item">
              <div
                className="admin-upload-stepper-step-circle"
                style={{
                  backgroundColor: circleBg,
                  color: circleColor,
                  border: circleBorder
                }}
              >
                {isDone ? '✓' : index + 1}
              </div>
              <span className="admin-upload-stepper-step-label" style={{ color: labelColor }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress Bar */}
      <div className="admin-upload-stepper-progress-bar-wrapper">
        <div
          className="admin-upload-stepper-progress-bar-fill"
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
            backgroundColor:
              stage === 'error'
                ? 'var(--crimson)'
                : stage === 'completed'
                  ? 'var(--win)'
                  : 'var(--lime)'
          }}
        />
      </div>

      {/* Live Terminal Log View */}
      <div className="admin-upload-stepper-terminal-wrapper">
        <div className="admin-upload-stepper-terminal-header">
          <div className="admin-upload-stepper-terminal-dots">
            <span
              className="admin-upload-stepper-dot"
              style={{ backgroundColor: 'var(--crimson)' }}
            />
            <span
              className="admin-upload-stepper-dot"
              style={{ backgroundColor: 'var(--amber)' }}
            />
            <span className="admin-upload-stepper-dot" style={{ backgroundColor: 'var(--win)' }} />
          </div>
          <span>Live Ingestion Console</span>
          <span>{terminalLogs.length} events</span>
        </div>
        <div className="admin-upload-stepper-terminal-body">
          {terminalLogs.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
              Waiting for stream events...
            </div>
          ) : (
            terminalLogs.map((log, idx) => {
              const isError = log.includes('[ERROR]');
              const isAnomaly = log.includes('[ANOMALY]');
              const isSuccess = log.includes('[SUCCESS]');
              const isQueue = log.includes('[QUEUE]');

              let textColor = 'var(--text)';
              if (isError) textColor = 'var(--crimson)';
              else if (isAnomaly) textColor = 'var(--amber)';
              else if (isSuccess) textColor = 'var(--win)';
              else if (isQueue) textColor = 'var(--lime)';

              return (
                <div key={`${idx}-${log.slice(0, 10)}`} className="admin-upload-stepper-log-line">
                  <span className="admin-upload-stepper-log-index">{idx + 1}</span>
                  <span style={{ color: textColor }}>{log}</span>
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}
