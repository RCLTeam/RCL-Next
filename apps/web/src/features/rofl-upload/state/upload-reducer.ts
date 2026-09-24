import type { UploadAction as BaseUploadAction, UploadState } from '../types/upload.types.js';

export type UploadAction =
  | Exclude<BaseUploadAction, { type: 'connection_lost' }>
  | {
      type: 'connection_lost';
      message?: string | undefined;
      code?: number | undefined;
      reason?: string | undefined;
    };

export const initialUploadState: UploadState = {
  stage: 'idle',
  status: 'idle',
  progress: 0,
  queuePosition: null,
  queueTotal: null,
  terminalLogs: [],
  anomalies: [],
  missingPlayers: [],
  summary: null,
  errorMessage: null,
  fileName: null
};

function extractMissingPlayers(message: string): string[] {
  const match = message.match(/not registered in [^:]+:\s*([^\n\r]+)/i);
  if (match?.[1]) {
    return match[1]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

export function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'start':
    case 'started': {
      return {
        ...initialUploadState,
        stage: 'uploading',
        status: 'uploading',
        fileName: action.filename,
        terminalLogs: [`[UPLOAD] Ingesting replay file: ${action.filename}`]
      };
    }

    case 'queue': {
      const position = action.position;
      const total = action.total;
      return {
        ...state,
        stage: 'queue',
        status: 'queue',
        queuePosition: position,
        queueTotal: total,
        terminalLogs: [
          ...state.terminalLogs,
          `[QUEUE] In decompression queue (Position ${position} of ${total})`
        ]
      };
    }

    case 'stage': {
      const nextStage = action.stage;
      return {
        ...state,
        stage: nextStage,
        status: nextStage,
        queuePosition: nextStage === 'queue' ? state.queuePosition : null,
        queueTotal: nextStage === 'queue' ? state.queueTotal : null,
        terminalLogs: [...state.terminalLogs, `[STAGE] Transitioned to stage: ${nextStage}`]
      };
    }

    case 'progress': {
      return {
        ...state,
        progress: action.percent,
        terminalLogs: [...state.terminalLogs, `[PROGRESS] ${action.message}`]
      };
    }

    case 'warning': {
      return {
        ...state,
        terminalLogs: [...state.terminalLogs, `[WARNING] ${action.message}`]
      };
    }

    case 'anomaly': {
      const accountsList = action.anomaly.accounts
        .map((acc) => `${acc.account} (${acc.champion})`)
        .join(', ');
      return {
        ...state,
        anomalies: [...state.anomalies, action.anomaly],
        terminalLogs: [
          ...state.terminalLogs,
          `[ANOMALY] ${action.anomaly.discordUsername} (${action.anomaly.gameFile}): ${accountsList}`
        ]
      };
    }

    case 'success': {
      const anomalies = action.summary.anomalies?.length
        ? action.summary.anomalies
        : state.anomalies;
      return {
        ...state,
        stage: 'completed',
        status: 'completed',
        progress: 100,
        summary: action.summary,
        anomalies,
        terminalLogs: [
          ...state.terminalLogs,
          `[SUCCESS] Ingestion completed: ${action.summary.processedGames} games processed, ${action.summary.detectedDiscordUsersCount} Discord users detected.`
        ]
      };
    }

    case 'error': {
      const missing = extractMissingPlayers(action.message);
      return {
        ...state,
        stage: 'error',
        status: 'error',
        errorMessage: action.message,
        missingPlayers: missing.length > 0 ? missing : state.missingPlayers,
        terminalLogs: [...state.terminalLogs, `[ERROR] ${action.message}`]
      };
    }

    case 'connection_lost': {
      let customMessage = action.message ?? 'Conexión interrumpida, por favor reintente';
      if (action.code === 4001) {
        customMessage = 'Sesión expirada o no autenticada. Por favor, inicia sesión nuevamente.';
      } else if (action.code === 4003) {
        customMessage = 'Acceso denegado: se requieren permisos de administrador.';
      } else if (action.code === 1009) {
        customMessage = 'El archivo supera el tamaño máximo permitido (50MB).';
      } else if (action.code != null) {
        customMessage = 'Conexión cerrada inesperadamente con el servidor.';
      }

      const logDetails =
        action.code != null
          ? `[ERROR] WebSocket connection closed (code: ${action.code}, reason: ${action.reason || 'None'}): ${customMessage}`
          : `[ERROR] ${customMessage}`;

      return {
        ...state,
        stage: 'error',
        status: 'error',
        errorMessage: customMessage,
        terminalLogs: [...state.terminalLogs, logDetails]
      };
    }

    case 'batch_logs': {
      return {
        ...state,
        terminalLogs: [...state.terminalLogs, ...action.logs]
      };
    }

    case 'log': {
      return {
        ...state,
        terminalLogs: [...state.terminalLogs, action.message]
      };
    }

    case 'reset': {
      return initialUploadState;
    }

    default:
      return state;
  }
}
