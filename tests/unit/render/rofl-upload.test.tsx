import React from 'react';
import { renderToString } from 'react-dom/server';
import { expect, test } from 'vitest';
import { AnomalyAlerts } from '../../../apps/web/src/features/rofl-upload/components/AnomalyAlerts.js';
import { BatchSummaryCard } from '../../../apps/web/src/features/rofl-upload/components/BatchSummaryCard.js';
import { MissingPlayersAlert } from '../../../apps/web/src/features/rofl-upload/components/MissingPlayersAlert.js';
import { RoflDropzone } from '../../../apps/web/src/features/rofl-upload/components/RoflDropzone.js';
import { RoflUploadPanel } from '../../../apps/web/src/features/rofl-upload/components/RoflUploadPanel.js';
import { UploadStepper } from '../../../apps/web/src/features/rofl-upload/components/UploadStepper.js';
import {
  type UseRoflUploadWsReturn,
  useRoflUploadWs
} from '../../../apps/web/src/features/rofl-upload/hooks/useRoflUploadWs.js';

test('RoflDropzone renders accessible drop target and format badges', () => {
  const html = renderToString(React.createElement(RoflDropzone, { onFileSelected: () => {} }));
  expect(html).toMatch(/Dropzone for ROFL and ZIP files/i);
  expect(html).toMatch(/\.ROFL \(Single Replay\)/i);
  expect(html).toMatch(/\.ZIP \(Batch Archive\)/i);
  expect(html).toMatch(/Select or drop League of Legends replays/i);
});

test('UploadStepper renders queue state and live terminal logs', () => {
  const html = renderToString(
    React.createElement(UploadStepper, {
      stage: 'queue',
      progress: 30,
      queuePosition: 2,
      queueTotal: 4,
      terminalLogs: ['[QUEUE] In decompression queue (Position 2 of 4)', '[UPLOAD] Finished chunk'],
      fileName: 'replays_week_1.zip'
    })
  );
  expect(html).toMatch(/replays_week_1\.zip/i);
  expect(html).toMatch(/Decompression Queue Active/i);
  expect(html).toMatch(/Position 2 of 4/i);
  expect(html).toMatch(/Live Ingestion Console/i);
  expect(html).toMatch(/In decompression queue/i);
});

test('MissingPlayersAlert renders unregistered player list and warnings', () => {
  const html = renderToString(
    React.createElement(MissingPlayersAlert, {
      missingPlayers: ['Faker#T1', 'Chovy#GEN'],
      errorMessage: 'Validation failed: The following summoners are not registered'
    })
  );
  expect(html).toMatch(/Validation Aborted: Unregistered Players Detected/i);
  expect(html).toMatch(/Faker#T1/i);
  expect(html).toMatch(/Chovy#GEN/i);
});

test('AnomalyAlerts renders multi-account warning cards', () => {
  const html = renderToString(
    React.createElement(AnomalyAlerts, {
      anomalies: [
        {
          gameFile: 'EUW1-100.rofl',
          discordUserId: 'disc-42',
          discordUsername: 'GamerOne',
          accounts: [
            { account: 'Main#EUW', champion: 'Ahri' },
            { account: 'Smurf#EUW', champion: 'Zed' }
          ]
        }
      ]
    })
  );
  expect(html).toMatch(/Multi-Account Detection Warnings/i);
  expect(html).toMatch(/EUW1-100\.rofl/i);
  expect(html).toMatch(/GamerOne/i);
  expect(html).toMatch(/Main#EUW/i);
  expect(html).toMatch(/Ahri/i);
});

test('BatchSummaryCard renders processed statistics and skipped duplicates', () => {
  const html = renderToString(
    React.createElement(BatchSummaryCard, {
      summary: {
        processedGames: 4,
        detectedDiscordUsersCount: 10,
        detectedPlayersCount: 10,
        anomalies: [],
        skippedDuplicates: ['MATCH-DUP-99']
      },
      onReset: () => {}
    })
  );
  expect(html).toMatch(/Batch Ingestion Complete/i);
  expect(html).toMatch(/>4</);
  expect(html).toMatch(/MATCH-DUP-99/i);
  expect(html).toMatch(/Upload Another Batch/i);
});

test('RoflUploadPanel renders complete initial console with dropzone', () => {
  const html = renderToString(React.createElement(RoflUploadPanel));
  expect(html).toMatch(/ROFL Upload/i);
  expect(html).toMatch(/Espacio de trabajo para la ingesta administrativa/i);
  expect(html).toMatch(/Dropzone for ROFL and ZIP files/i);
});

test('useRoflUploadWs does not open a WebSocket without wsUrl nor window.location', async () => {
  expect((globalThis as { window?: unknown }).window).toBe(undefined);
  const openedUrls: string[] = [];
  const originalWebSocket = globalThis.WebSocket;
  class RecordingWebSocket {
    binaryType = 'blob';
    constructor(url: string) {
      openedUrls.push(url);
    }
    close(): void {}
  }
  globalThis.WebSocket = RecordingWebSocket as unknown as typeof WebSocket;
  try {
    let hook: UseRoflUploadWsReturn | undefined;
    function Probe() {
      hook = useRoflUploadWs();
      return null;
    }
    renderToString(React.createElement(Probe));
    expect(hook).toBeTruthy();
    await hook.uploadFile(new File(['replay'], 'match.rofl'));
    expect(openedUrls).toStrictEqual([]);
  } finally {
    globalThis.WebSocket = originalWebSocket;
  }
});
