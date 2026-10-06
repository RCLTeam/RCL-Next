import type { BatchUploadSummary, MultiAccountAnomaly } from '@rcl/contracts';
import { expect, test } from 'vitest';
import {
  MISSING_WS_URL_MESSAGE,
  resolveRoflUploadWsUrl
} from '../../apps/web/src/features/rofl-upload/hooks/useRoflUploadWs.js';
import {
  initialUploadState,
  uploadReducer
} from '../../apps/web/src/features/rofl-upload/state/upload-reducer.js';

test('uploadReducer starts upload and transitions to uploading stage', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'start',
    filename: 'match_batch.zip'
  });
  expect(state.status).toBe('uploading');
  expect(state.stage).toBe('uploading');
  expect(state.fileName).toBe('match_batch.zip');
  expect(state.terminalLogs.some((l) => l.includes('match_batch.zip'))).toBeTruthy();
});

test('uploadReducer transitions to queue stage with position and total', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'queue',
    position: 2,
    total: 3
  });
  expect(state.status).toBe('queue');
  expect(state.stage).toBe('queue');
  expect(state.queuePosition).toBe(2);
  expect(state.queueTotal).toBe(3);
  expect(state.terminalLogs.some((l) => l.includes('Position 2 of 3'))).toBeTruthy();
});

test('uploadReducer updates processing stage and clears queue metrics', () => {
  const queueState = uploadReducer(initialUploadState, {
    type: 'queue',
    position: 1,
    total: 1
  });
  const decompressingState = uploadReducer(queueState, {
    type: 'stage',
    stage: 'decompressing'
  });
  expect(decompressingState.status).toBe('decompressing');
  expect(decompressingState.stage).toBe('decompressing');
  expect(decompressingState.queuePosition).toBe(null);
  expect(decompressingState.queueTotal).toBe(null);

  const parsingState = uploadReducer(decompressingState, {
    type: 'stage',
    stage: 'parsing'
  });
  expect(parsingState.stage).toBe('parsing');
});

test('uploadReducer updates progress and logs message', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'progress',
    percent: 45,
    message: 'Parsed 3/10 replay files'
  });
  expect(state.progress).toBe(45);
  expect(state.terminalLogs.some((l) => l.includes('Parsed 3/10 replay files'))).toBeTruthy();
});

test('uploadReducer records multi-account anomalies', () => {
  const anomaly: MultiAccountAnomaly = {
    gameFile: 'EUW1-12345.rofl',
    discordUserId: 'discord_user_99',
    discordUsername: 'RCL_ProGamer',
    accounts: [
      { account: 'MainAccount#EUW', champion: 'Ahri' },
      { account: 'SmurfAccount#EUW', champion: 'Zed' }
    ]
  };
  const state = uploadReducer(initialUploadState, {
    type: 'anomaly',
    anomaly
  });
  expect(state.anomalies.length).toBe(1);
  expect(state.anomalies[0]?.discordUserId).toBe('discord_user_99');
  expect(state.anomalies[0]?.accounts.length).toBe(2);
  expect(state.terminalLogs.some((l) => l.includes('RCL_ProGamer'))).toBeTruthy();
});

test('uploadReducer stores missing players on error', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'error',
    message: 'The following players are not registered in the database: Faker#KR1, Deft#KR2'
  });
  expect(state.status).toBe('error');
  expect(state.stage).toBe('error');
  expect(state.errorMessage ?? '').toMatch(/Faker#KR1/);
  expect(state.missingPlayers).toStrictEqual(['Faker#KR1', 'Deft#KR2']);
  expect(state.terminalLogs.some((l) => l.includes('[ERROR]'))).toBeTruthy();
});

test('uploadReducer handles generic errors without missing players', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'error',
    message: 'Disk write error: out of space'
  });
  expect(state.status).toBe('error');
  expect(state.stage).toBe('error');
  expect(state.errorMessage).toBe('Disk write error: out of space');
  expect(state.missingPlayers).toStrictEqual([]);
});

test('uploadReducer handles socket disconnect cleanly', () => {
  const state = uploadReducer(
    { ...initialUploadState, status: 'uploading', stage: 'uploading' },
    {
      type: 'connection_lost'
    }
  );
  expect(state.status).toBe('error');
  expect(state.stage).toBe('error');
  expect(state.errorMessage ?? '').toMatch(/desconexión|interrumpida|connection/i);
  expect(state.terminalLogs.some((l) => l.includes('interrumpida'))).toBeTruthy();
});

test('uploadReducer records batch success with summary', () => {
  const summary: BatchUploadSummary = {
    processedGames: 5,
    detectedDiscordUsersCount: 10,
    detectedPlayersCount: 10,
    anomalies: [],
    skippedDuplicates: ['EUW1-11111']
  };
  const state = uploadReducer(initialUploadState, {
    type: 'success',
    summary
  });
  expect(state.status).toBe('completed');
  expect(state.stage).toBe('completed');
  expect(state.progress).toBe(100);
  expect(state.summary?.processedGames).toBe(5);
  expect(state.summary?.skippedDuplicates).toStrictEqual(['EUW1-11111']);
  expect(state.terminalLogs.some((l) => l.includes('[SUCCESS]'))).toBeTruthy();
});

test('uploadReducer handles batch logs and reset', () => {
  const loggedState = uploadReducer(initialUploadState, {
    type: 'batch_logs',
    logs: ['Log message 1', 'Log message 2']
  });
  expect(loggedState.terminalLogs.length).toBe(2);

  const singleLoggedState = uploadReducer(loggedState, {
    type: 'log',
    message: 'Log message 3'
  });
  expect(singleLoggedState.terminalLogs.length).toBe(3);

  const resetState = uploadReducer(singleLoggedState, {
    type: 'reset'
  });
  expect(resetState).toStrictEqual(initialUploadState);
});

test('uploadReducer handles specific connection_lost messages for 4001 and 4003', () => {
  const state4001 = uploadReducer(initialUploadState, {
    type: 'connection_lost',
    code: 4001,
    reason: 'Unauthorized'
  });
  expect(state4001.status).toBe('error');
  expect(
    state4001.errorMessage?.includes('sesión') || state4001.errorMessage?.includes('inicia sesión')
  ).toBeTruthy();
  expect(
    state4001.terminalLogs.some((l) => l.includes('4001') && l.includes('Unauthorized'))
  ).toBeTruthy();

  const state4003 = uploadReducer(initialUploadState, {
    type: 'connection_lost',
    code: 4003,
    reason: 'Forbidden'
  });
  expect(state4003.status).toBe('error');
  expect(
    state4003.errorMessage?.includes('administrador') ||
      state4003.errorMessage?.includes('permisos')
  ).toBeTruthy();
  expect(
    state4003.terminalLogs.some((l) => l.includes('4003') && l.includes('Forbidden'))
  ).toBeTruthy();
});

test('uploadReducer handles specific connection_lost message for 1009 and default codes', () => {
  const state1009 = uploadReducer(initialUploadState, {
    type: 'connection_lost',
    code: 1009,
    reason: 'Message too big'
  });
  expect(state1009.status).toBe('error');
  expect(state1009.errorMessage).toBe('El archivo supera el tamaño máximo permitido (50MB).');
  expect(
    state1009.terminalLogs.some(
      (l) => l.includes('code: 1009') && l.includes('El archivo supera el tamaño máximo permitido')
    )
  ).toBeTruthy();

  const stateDefault = uploadReducer(initialUploadState, {
    type: 'connection_lost',
    code: 1006
  });
  expect(stateDefault.status).toBe('error');
  expect(stateDefault.errorMessage).toBe('Conexión cerrada inesperadamente con el servidor.');
  expect(
    stateDefault.terminalLogs.some(
      (l) => l.includes('code: 1006') && l.includes('Conexión cerrada inesperadamente')
    )
  ).toBeTruthy();
});

test('uploadReducer handles upload timeout error', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'error',
    message: 'Upload backpressure timeout: network stalled for over 15 seconds'
  });
  expect(state.status).toBe('error');
  expect(state.errorMessage).toBe(
    'Upload backpressure timeout: network stalled for over 15 seconds'
  );
});

test('resolveRoflUploadWsUrl derives the gateway URL from the page location', () => {
  expect(resolveRoflUploadWsUrl(undefined, { protocol: 'http:', host: 'localhost:5173' })).toBe(
    'ws://localhost:5173/ws/rofl-upload'
  );
  expect(resolveRoflUploadWsUrl(undefined, { protocol: 'https:', host: 'rcl.example' })).toBe(
    'wss://rcl.example/ws/rofl-upload'
  );
  expect(
    resolveRoflUploadWsUrl('ws://gateway.test/ws/rofl-upload', { protocol: 'https:', host: 'x' })
  ).toBe('ws://gateway.test/ws/rofl-upload');
});

test('resolveRoflUploadWsUrl returns null without wsUrl nor window.location', () => {
  expect(resolveRoflUploadWsUrl(undefined, undefined)).toBe(null);
  expect(resolveRoflUploadWsUrl(undefined, { protocol: 'http:' })).toBe(null);
  expect(resolveRoflUploadWsUrl('', { protocol: 'http:', host: '' })).toBe(null);
});

test('uploadReducer exposes the missing WebSocket URL error', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'error',
    message: MISSING_WS_URL_MESSAGE
  });
  expect(state.status).toBe('error');
  expect(state.errorMessage).toBe(MISSING_WS_URL_MESSAGE);
});
