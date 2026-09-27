import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BatchUploadSummary, MultiAccountAnomaly } from '@rcl/contracts';
import {
  initialUploadState,
  uploadReducer
} from '../../apps/web/src/features/rofl-upload/state/upload-reducer.js';

test('uploadReducer starts upload and transitions to uploading stage', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'start',
    filename: 'match_batch.zip'
  });
  assert.equal(state.status, 'uploading');
  assert.equal(state.stage, 'uploading');
  assert.equal(state.fileName, 'match_batch.zip');
  assert.ok(state.terminalLogs.some((l) => l.includes('match_batch.zip')));
});

test('uploadReducer transitions to queue stage with position and total', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'queue',
    position: 2,
    total: 3
  });
  assert.equal(state.status, 'queue');
  assert.equal(state.stage, 'queue');
  assert.equal(state.queuePosition, 2);
  assert.equal(state.queueTotal, 3);
  assert.ok(state.terminalLogs.some((l) => l.includes('Position 2 of 3')));
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
  assert.equal(decompressingState.status, 'decompressing');
  assert.equal(decompressingState.stage, 'decompressing');
  assert.equal(decompressingState.queuePosition, null);
  assert.equal(decompressingState.queueTotal, null);

  const parsingState = uploadReducer(decompressingState, {
    type: 'stage',
    stage: 'parsing'
  });
  assert.equal(parsingState.stage, 'parsing');
});

test('uploadReducer updates progress and logs message', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'progress',
    percent: 45,
    message: 'Parsed 3/10 replay files'
  });
  assert.equal(state.progress, 45);
  assert.ok(state.terminalLogs.some((l) => l.includes('Parsed 3/10 replay files')));
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
  assert.equal(state.anomalies.length, 1);
  assert.equal(state.anomalies[0]?.discordUserId, 'discord_user_99');
  assert.equal(state.anomalies[0]?.accounts.length, 2);
  assert.ok(state.terminalLogs.some((l) => l.includes('RCL_ProGamer')));
});

test('uploadReducer stores missing players on error', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'error',
    message: 'The following players are not registered in the database: Faker#KR1, Deft#KR2'
  });
  assert.equal(state.status, 'error');
  assert.equal(state.stage, 'error');
  assert.match(state.errorMessage ?? '', /Faker#KR1/);
  assert.deepEqual(state.missingPlayers, ['Faker#KR1', 'Deft#KR2']);
  assert.ok(state.terminalLogs.some((l) => l.includes('[ERROR]')));
});

test('uploadReducer handles generic errors without missing players', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'error',
    message: 'Disk write error: out of space'
  });
  assert.equal(state.status, 'error');
  assert.equal(state.stage, 'error');
  assert.equal(state.errorMessage, 'Disk write error: out of space');
  assert.deepEqual(state.missingPlayers, []);
});

test('uploadReducer handles socket disconnect cleanly', () => {
  const state = uploadReducer(
    { ...initialUploadState, status: 'uploading', stage: 'uploading' },
    {
      type: 'connection_lost'
    }
  );
  assert.equal(state.status, 'error');
  assert.equal(state.stage, 'error');
  assert.match(state.errorMessage ?? '', /desconexión|interrumpida|connection/i);
  assert.ok(state.terminalLogs.some((l) => l.includes('interrumpida')));
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
  assert.equal(state.status, 'completed');
  assert.equal(state.stage, 'completed');
  assert.equal(state.progress, 100);
  assert.equal(state.summary?.processedGames, 5);
  assert.deepEqual(state.summary?.skippedDuplicates, ['EUW1-11111']);
  assert.ok(state.terminalLogs.some((l) => l.includes('[SUCCESS]')));
});

test('uploadReducer handles batch logs and reset', () => {
  const loggedState = uploadReducer(initialUploadState, {
    type: 'batch_logs',
    logs: ['Log message 1', 'Log message 2']
  });
  assert.equal(loggedState.terminalLogs.length, 2);

  const singleLoggedState = uploadReducer(loggedState, {
    type: 'log',
    message: 'Log message 3'
  });
  assert.equal(singleLoggedState.terminalLogs.length, 3);

  const resetState = uploadReducer(singleLoggedState, {
    type: 'reset'
  });
  assert.deepEqual(resetState, initialUploadState);
});

test('uploadReducer handles specific connection_lost messages for 4001 and 4003', () => {
  const state4001 = uploadReducer(initialUploadState, {
    type: 'connection_lost',
    code: 4001,
    reason: 'Unauthorized'
  });
  assert.equal(state4001.status, 'error');
  assert.ok(
    state4001.errorMessage?.includes('sesión') || state4001.errorMessage?.includes('inicia sesión')
  );
  assert.ok(state4001.terminalLogs.some((l) => l.includes('4001') && l.includes('Unauthorized')));

  const state4003 = uploadReducer(initialUploadState, {
    type: 'connection_lost',
    code: 4003,
    reason: 'Forbidden'
  });
  assert.equal(state4003.status, 'error');
  assert.ok(
    state4003.errorMessage?.includes('administrador') ||
      state4003.errorMessage?.includes('permisos')
  );
  assert.ok(state4003.terminalLogs.some((l) => l.includes('4003') && l.includes('Forbidden')));
});

test('uploadReducer handles specific connection_lost message for 1009 and default codes', () => {
  const state1009 = uploadReducer(initialUploadState, {
    type: 'connection_lost',
    code: 1009,
    reason: 'Message too big'
  });
  assert.equal(state1009.status, 'error');
  assert.equal(state1009.errorMessage, 'El archivo supera el tamaño máximo permitido (50MB).');
  assert.ok(
    state1009.terminalLogs.some(
      (l) => l.includes('code: 1009') && l.includes('El archivo supera el tamaño máximo permitido')
    )
  );

  const stateDefault = uploadReducer(initialUploadState, {
    type: 'connection_lost',
    code: 1006
  });
  assert.equal(stateDefault.status, 'error');
  assert.equal(stateDefault.errorMessage, 'Conexión cerrada inesperadamente con el servidor.');
  assert.ok(
    stateDefault.terminalLogs.some(
      (l) => l.includes('code: 1006') && l.includes('Conexión cerrada inesperadamente')
    )
  );
});

test('uploadReducer handles upload timeout error', () => {
  const state = uploadReducer(initialUploadState, {
    type: 'error',
    message: 'Upload backpressure timeout: network stalled for over 15 seconds'
  });
  assert.equal(state.status, 'error');
  assert.equal(
    state.errorMessage,
    'Upload backpressure timeout: network stalled for over 15 seconds'
  );
});
