import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AnomalyAlerts } from './AnomalyAlerts.js';
import { BatchSummaryCard } from './BatchSummaryCard.js';
import { MissingPlayersAlert } from './MissingPlayersAlert.js';
import { RoflDropzone } from './RoflDropzone.js';
import { RoflUploadPanel } from './RoflUploadPanel.js';
import { UploadStepper } from './UploadStepper.js';

test('RoflDropzone renders accessible drop target and format badges', () => {
  const html = renderToString(React.createElement(RoflDropzone, { onFileSelected: () => {} }));
  assert.match(html, /Dropzone for ROFL and ZIP files/i);
  assert.match(html, /\.ROFL \(Single Replay\)/i);
  assert.match(html, /\.ZIP \(Batch Archive\)/i);
  assert.match(html, /Select or drop League of Legends replays/i);
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
  assert.match(html, /replays_week_1\.zip/i);
  assert.match(html, /Decompression Queue Active/i);
  assert.match(html, /Position 2 of 4/i);
  assert.match(html, /Live Ingestion Console/i);
  assert.match(html, /In decompression queue/i);
});

test('MissingPlayersAlert renders unregistered player list and warnings', () => {
  const html = renderToString(
    React.createElement(MissingPlayersAlert, {
      missingPlayers: ['Faker#T1', 'Chovy#GEN'],
      errorMessage: 'Validation failed: The following summoners are not registered'
    })
  );
  assert.match(html, /Validation Aborted: Unregistered Players Detected/i);
  assert.match(html, /Faker#T1/i);
  assert.match(html, /Chovy#GEN/i);
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
  assert.match(html, /Multi-Account Detection Warnings/i);
  assert.match(html, /EUW1-100\.rofl/i);
  assert.match(html, /GamerOne/i);
  assert.match(html, /Main#EUW/i);
  assert.match(html, /Ahri/i);
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
  assert.match(html, /Batch Ingestion Complete/i);
  assert.match(html, />4</);
  assert.match(html, /MATCH-DUP-99/i);
  assert.match(html, /Upload Another Batch/i);
});

test('RoflUploadPanel renders complete initial console with dropzone', () => {
  const html = renderToString(React.createElement(RoflUploadPanel));
  assert.match(html, /ROFL Replay Upload/i);
  assert.match(html, /Administrative batch ingestion workspace/i);
  assert.match(html, /Dropzone for ROFL and ZIP files/i);
});
