import React, { type CSSProperties, useEffect, useRef } from 'react';
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

const styles: Record<string, CSSProperties> = {
  container: {
    backgroundColor: '#121622',
    border: '1px solid rgba(123, 44, 255, 0.3)',
    borderRadius: '12px',
    padding: '1.75rem',
    marginBottom: '1.5rem'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
    flexWrap: 'wrap',
    gap: '0.75rem'
  },
  fileTitle: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#FFFFFF'
  },
  stageBadge: {
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  queueAlert: {
    backgroundColor: 'rgba(244, 255, 58, 0.12)',
    border: '1px solid rgba(244, 255, 58, 0.4)',
    borderRadius: '8px',
    padding: '0.85rem 1.25rem',
    marginBottom: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: '#F4FF3A'
  },
  queueText: {
    margin: 0,
    fontSize: '0.9rem',
    fontWeight: 600
  },
  queueBadge: {
    backgroundColor: '#F4FF3A',
    color: '#0B0E14',
    padding: '0.2rem 0.6rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 800
  },
  stepperTrack: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    marginBottom: '2rem'
  },
  stepItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    zIndex: 2,
    flex: 1
  },
  stepCircle: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    fontWeight: 700,
    marginBottom: '0.5rem',
    transition: 'all 0.3s ease'
  },
  stepLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textAlign: 'center',
    transition: 'color 0.3s ease'
  },
  progressBarWrapper: {
    backgroundColor: '#1A2133',
    borderRadius: '9999px',
    height: '8px',
    overflow: 'hidden',
    marginBottom: '1.5rem'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F4FF3A',
    transition: 'width 0.3s ease-out'
  },
  terminalWrapper: {
    backgroundColor: '#0A0D14',
    border: '1px solid #1E2538',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  terminalHeader: {
    backgroundColor: '#121622',
    padding: '0.5rem 1rem',
    borderBottom: '1px solid #1E2538',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.75rem',
    color: '#94A3B8',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  },
  terminalDots: {
    display: 'flex',
    gap: '6px'
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%'
  },
  terminalBody: {
    padding: '1rem',
    maxHeight: '220px',
    overflowY: 'auto',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '0.8rem',
    lineHeight: 1.6,
    color: '#E2E8F0'
  },
  logLine: {
    display: 'flex',
    gap: '0.75rem',
    marginBottom: '0.25rem'
  },
  logIndex: {
    color: '#475569',
    userSelect: 'none',
    minWidth: '24px',
    textAlign: 'right'
  }
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
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.fileTitle}>
          {fileName ? `Replay Batch: ${fileName}` : 'Ingestion Pipeline'}
        </h3>
        <span
          style={{
            ...styles.stageBadge,
            backgroundColor:
              stage === 'completed'
                ? 'rgba(16, 185, 129, 0.2)'
                : stage === 'error'
                  ? 'rgba(239, 68, 68, 0.2)'
                  : stage === 'queue'
                    ? 'rgba(244, 255, 58, 0.2)'
                    : 'rgba(123, 44, 255, 0.2)',
            color:
              stage === 'completed'
                ? '#34D399'
                : stage === 'error'
                  ? '#F87171'
                  : stage === 'queue'
                    ? '#F4FF3A'
                    : '#A78BFA',
            border: `1px solid ${
              stage === 'completed'
                ? '#10B981'
                : stage === 'error'
                  ? '#EF4444'
                  : stage === 'queue'
                    ? '#F4FF3A'
                    : '#7B2CFF'
            }`
          }}
        >
          {stage}
        </span>
      </div>

      {isQueueActive && (
        <div style={styles.queueAlert}>
          <p style={styles.queueText}>
            Decompression Queue Active &bull; Server is currently decompressing another archive.
          </p>
          <span style={styles.queueBadge}>
            Position {queuePosition} of {queueTotal}
          </span>
        </div>
      )}

      {/* Progress Track */}
      <div style={styles.stepperTrack}>
        {PRIMARY_STEPS.map((step, index) => {
          const stepOrder = STAGE_ORDER[step.stageKey];
          const isDone = currentOrder > stepOrder || stage === 'completed';
          const isCurrent =
            stage === step.stageKey || (step.key === 'decompressing' && stage === 'queue');
          const isErrorStep = stage === 'error' && index === Math.max(0, currentOrder - 1);

          let circleBg = '#1E2538';
          let circleColor = '#64748B';
          let circleBorder = '1px solid #334155';
          let labelColor = '#64748B';

          if (isDone) {
            circleBg = '#10B981';
            circleColor = '#FFFFFF';
            circleBorder = '1px solid #10B981';
            labelColor = '#34D399';
          } else if (isCurrent) {
            circleBg = '#7B2CFF';
            circleColor = '#F4FF3A';
            circleBorder = '2px solid #F4FF3A';
            labelColor = '#FFFFFF';
          } else if (isErrorStep) {
            circleBg = '#EF4444';
            circleColor = '#FFFFFF';
            circleBorder = '1px solid #EF4444';
            labelColor = '#F87171';
          }

          return (
            <div key={step.key} style={styles.stepItem}>
              <div
                style={{
                  ...styles.stepCircle,
                  backgroundColor: circleBg,
                  color: circleColor,
                  border: circleBorder
                }}
              >
                {isDone ? '✓' : index + 1}
              </div>
              <span style={{ ...styles.stepLabel, color: labelColor }}>{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Progress Bar */}
      <div style={styles.progressBarWrapper}>
        <div
          style={{
            ...styles.progressBarFill,
            width: `${Math.min(100, Math.max(0, progress))}%`,
            backgroundColor:
              stage === 'error' ? '#EF4444' : stage === 'completed' ? '#10B981' : '#F4FF3A'
          }}
        />
      </div>

      {/* Live Terminal Log View */}
      <div style={styles.terminalWrapper}>
        <div style={styles.terminalHeader}>
          <div style={styles.terminalDots}>
            <span style={{ ...styles.dot, backgroundColor: '#EF4444' }} />
            <span style={{ ...styles.dot, backgroundColor: '#F59E0B' }} />
            <span style={{ ...styles.dot, backgroundColor: '#10B981' }} />
          </div>
          <span>Live Ingestion Console</span>
          <span>{terminalLogs.length} events</span>
        </div>
        <div style={styles.terminalBody}>
          {terminalLogs.length === 0 ? (
            <div style={{ color: '#64748B', fontStyle: 'italic' }}>
              Waiting for stream events...
            </div>
          ) : (
            terminalLogs.map((log, idx) => {
              const isError = log.includes('[ERROR]');
              const isAnomaly = log.includes('[ANOMALY]');
              const isSuccess = log.includes('[SUCCESS]');
              const isQueue = log.includes('[QUEUE]');

              let textColor = '#E2E8F0';
              if (isError) textColor = '#F87171';
              else if (isAnomaly) textColor = '#FBBF24';
              else if (isSuccess) textColor = '#34D399';
              else if (isQueue) textColor = '#F4FF3A';

              return (
                <div key={`${idx}-${log.slice(0, 10)}`} style={styles.logLine}>
                  <span style={styles.logIndex}>{idx + 1}</span>
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
