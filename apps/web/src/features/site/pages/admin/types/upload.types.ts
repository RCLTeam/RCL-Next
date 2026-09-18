import type { BatchUploadSummary, MultiAccountAnomaly, WsServerStageEvent } from '@rcl/contracts';

export type UploadStage = 'idle' | 'queue' | 'uploading' | 'error' | WsServerStageEvent['stage'];

export interface UploadState {
  stage: UploadStage;
  status: UploadStage;
  progress: number;
  queuePosition: number | null;
  queueTotal: number | null;
  terminalLogs: string[];
  anomalies: MultiAccountAnomaly[];
  missingPlayers: string[];
  summary: BatchUploadSummary | null;
  errorMessage: string | null;
  fileName: string | null;
}

export type UploadAction =
  | { type: 'start'; filename: string }
  | { type: 'started'; filename: string }
  | { type: 'queue'; stage?: 'queue' | undefined; position: number; total: number }
  | { type: 'stage'; stage: UploadStage }
  | { type: 'progress'; percent: number; message: string }
  | { type: 'warning'; message: string }
  | { type: 'anomaly'; anomaly: MultiAccountAnomaly }
  | { type: 'success'; summary: BatchUploadSummary }
  | { type: 'error'; message: string }
  | { type: 'connection_lost'; message?: string | undefined }
  | { type: 'reset' }
  | { type: 'batch_logs'; logs: string[] }
  | { type: 'log'; message: string };
