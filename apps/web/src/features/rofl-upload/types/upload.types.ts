export type UploadStage =
  | 'idle'
  | 'queue'
  | 'uploading'
  | 'decompressing'
  | 'parsing'
  | 'validating'
  | 'persisting'
  | 'completed'
  | 'error';

export interface MultiAccountAnomalyAccount {
  account: string;
  champion: string;
}

export interface MultiAccountAnomaly {
  gameFile: string;
  discordUserId: string;
  discordUsername: string;
  accounts: MultiAccountAnomalyAccount[];
}

export interface BatchUploadSummary {
  processedGames: number;
  detectedDiscordUsersCount: number;
  detectedPlayersCount: number;
  anomalies: MultiAccountAnomaly[];
  skippedDuplicates?: string[] | undefined;
}

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

export type WsServerStartedEvent = {
  type: 'started';
  filename: string;
};

export type WsServerQueueEvent = {
  type: 'queue';
  stage?: 'queue' | undefined;
  position: number;
  total: number;
};

export type WsServerStageEvent = {
  type: 'stage';
  stage: 'decompressing' | 'parsing' | 'validating' | 'persisting' | 'completed';
};

export type WsServerProgressEvent = {
  type: 'progress';
  percent: number;
  message: string;
};

export type WsServerAnomalyEvent = {
  type: 'anomaly';
  anomaly: MultiAccountAnomaly;
};

export type WsServerWarningEvent = {
  type: 'warning';
  message: string;
};

export type WsServerSuccessEvent = {
  type: 'success';
  summary: BatchUploadSummary;
};

export type WsServerErrorEvent = {
  type: 'error';
  message: string;
};

export type WsServerEvent =
  | WsServerStartedEvent
  | WsServerQueueEvent
  | WsServerStageEvent
  | WsServerProgressEvent
  | WsServerWarningEvent
  | WsServerAnomalyEvent
  | WsServerSuccessEvent
  | WsServerErrorEvent;

export type WsClientStartMessage = {
  type: 'start';
  filename: string;
};

export type WsClientFinishMessage = {
  type: 'finish';
};

export type WsClientMessage = WsClientStartMessage | WsClientFinishMessage;

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
