import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import type { RoflUploadRepository } from '../persistence/roflUpload.repository.js';
import { executePythonParser } from '../processing/executePythonParser.js';
import { cleanupTempDir, processBatchFiles } from '../processing/processBatchFiles.js';
import { transformParserJson } from '../processing/transformParserJson.js';
import type {
  BatchUploadResult,
  MultiAccountAnomaly,
  ParsedGameData,
  PlayerLookupResult
} from '../types/roflUpload.types.js';
import { detectMultiAccountAnomalies } from '../validation/detectMultiAccountAnomalies.js';
import { validateParticipantCache } from '../validation/validateParticipantCache.js';

export type GatewayStage =
  | 'queue'
  | 'decompressing'
  | 'parsing'
  | 'validating'
  | 'persisting'
  | 'completed';

export type GatewayServerMessage =
  | { type: 'started'; filename: string }
  | { type: 'queue'; stage: 'queue'; position: number; total: number }
  | {
      type: 'stage';
      stage: 'decompressing' | 'parsing' | 'validating' | 'persisting' | 'completed';
    }
  | { type: 'progress'; percent: number; message: string }
  | { type: 'warning'; message: string }
  | { type: 'anomaly'; anomaly: MultiAccountAnomaly }
  | { type: 'success'; summary: BatchUploadResult }
  | { type: 'error'; message: string };

export type GatewayClientMessage = { type: 'start'; filename: string } | { type: 'finish' };

export interface RoflUploadGatewayOptions {
  path?: string | undefined;
  pythonScriptPath?: string | undefined;
  pythonExecutable?: string | undefined;
  concurrency?: number | undefined;
}

export function attachRoflUploadGateway(
  server: http.Server,
  repository: RoflUploadRepository,
  options?: RoflUploadGatewayOptions
): WebSocketServer {
  const wsPath = options?.path ?? '/ws/rofl-upload';
  const wss = new WebSocketServer({ server, path: wsPath });

  const originalClose = wss.close.bind(wss);
  wss.close = (cb?: (err?: Error) => void): void => {
    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch {
        // Ignore already closed sockets
      }
    }
    originalClose(cb);
  };

  wss.on('connection', (ws: WebSocket) => {
    let state: 'idle' | 'uploading' | 'processing' | 'closed' = 'idle';
    let sessionDir: string | null = null;
    let batchTempDir: string | null = null;
    let fileWriteStream: fsSync.WriteStream | null = null;
    let safeFileName: string | null = null;
    const abortController = new AbortController();

    function safeSend(message: GatewayServerMessage): void {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }

    async function cleanupResources(): Promise<void> {
      if (fileWriteStream && !fileWriteStream.destroyed) {
        fileWriteStream.destroy();
        fileWriteStream = null;
      }
      if (batchTempDir) {
        const dir = batchTempDir;
        batchTempDir = null;
        await cleanupTempDir(dir).catch(() => {});
      }
      if (sessionDir) {
        const dir = sessionDir;
        sessionDir = null;
        await cleanupTempDir(dir).catch(() => {});
      }
    }

    ws.on('message', async (data: RawData, isBinary: boolean) => {
      // 1. Binary frames streaming directly to disk write stream
      if (isBinary) {
        if (state !== 'uploading' || !fileWriteStream) {
          safeSend({
            type: 'error',
            message: 'Binary data chunk received before upload was started'
          });
          return;
        }

        const buffer = Buffer.isBuffer(data)
          ? data
          : Array.isArray(data)
            ? Buffer.concat(data)
            : Buffer.from(data as ArrayBuffer);
        const canWrite = fileWriteStream.write(buffer);
        if (!canWrite) {
          ws.pause();
          fileWriteStream.once('drain', () => {
            ws.resume();
          });
        }
        return;
      }

      // 2. Text JSON protocol messages
      let clientMsg: GatewayClientMessage;
      try {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        clientMsg = JSON.parse(text) as GatewayClientMessage;
      } catch {
        safeSend({ type: 'error', message: 'Invalid JSON message payload' });
        return;
      }

      if (clientMsg.type === 'start') {
        if (state !== 'idle') {
          safeSend({ type: 'error', message: 'Upload already in progress' });
          return;
        }

        const originalName = clientMsg.filename?.trim();
        if (!originalName) {
          safeSend({ type: 'error', message: 'Missing filename in start payload' });
          return;
        }

        const ext = path.extname(originalName).toLowerCase();
        if (ext !== '.rofl' && ext !== '.zip') {
          safeSend({
            type: 'error',
            message: `Unsupported file type: expected .rofl or .zip, received '${originalName}'`
          });
          return;
        }

        safeFileName = path.basename(originalName);
        sessionDir = path.join(os.tmpdir(), `rcl-ws-upload-${crypto.randomUUID()}`);

        try {
          fsSync.mkdirSync(sessionDir, { recursive: true });
          const targetPath = path.join(sessionDir, safeFileName);
          fileWriteStream = fsSync.createWriteStream(targetPath);
          fileWriteStream.on('error', (err) => {
            safeSend({ type: 'error', message: `Disk write error: ${err.message}` });
          });
          state = 'uploading';
          safeSend({ type: 'started', filename: safeFileName });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          safeSend({ type: 'error', message: `Failed to initialize upload directory: ${message}` });
          await cleanupResources();
        }
        return;
      }

      if (clientMsg.type === 'finish') {
        if (state !== 'uploading' || !fileWriteStream || !sessionDir || !safeFileName) {
          safeSend({ type: 'error', message: 'No upload in progress to finish' });
          return;
        }

        state = 'processing';
        const targetUploadPath = path.join(sessionDir, safeFileName);

        try {
          await new Promise<void>((resolve, reject) => {
            if (!fileWriteStream) return resolve();
            fileWriteStream.on('finish', () => resolve());
            fileWriteStream.on('error', reject);
            fileWriteStream.end();
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          safeSend({ type: 'error', message: `Failed to flush file stream: ${message}` });
          await cleanupResources();
          state = 'idle';
          return;
        }

        try {
          // Step 1: processBatchFiles with decompression queue positional updates for .zip
          safeSend({ type: 'stage', stage: 'decompressing' });
          safeSend({
            type: 'progress',
            percent: 10,
            message: 'Extracting and preparing replay files...'
          });

          const batchFilesResult = await processBatchFiles({
            sourceFilePath: targetUploadPath,
            originalFileName: safeFileName,
            signal: abortController.signal,
            onQueueStatus: (pos, total) => {
              if (pos > 1) {
                safeSend({ type: 'queue', stage: 'queue', position: pos, total });
              } else {
                safeSend({ type: 'stage', stage: 'decompressing' });
                safeSend({
                  type: 'progress',
                  percent: 15,
                  message: 'Decompressing replay archive...'
                });
              }
            }
          });
          batchTempDir = batchFilesResult.tempDir;

          // Step 2: executePythonParser with real-time progress streaming
          safeSend({ type: 'stage', stage: 'parsing' });
          safeSend({ type: 'progress', percent: 25, message: 'Executing ROFL parser...' });

          const parserResult = await executePythonParser({
            roflFilePaths: batchFilesResult.roflFilePaths,
            outputDir: batchTempDir,
            pythonScriptPath: options?.pythonScriptPath,
            pythonExecutable: options?.pythonExecutable,
            concurrency: options?.concurrency,
            onWarning: (warningMsg) => {
              safeSend({ type: 'warning', message: warningMsg });
            },
            onProgress: (parsedCount, totalCount, currentFile) => {
              const pct = Math.min(65, Math.round(25 + (parsedCount / totalCount) * 40));
              safeSend({
                type: 'progress',
                percent: pct,
                message: `Parsed ${parsedCount}/${totalCount} files: ${path.basename(currentFile)}`
              });
            }
          });

          // Step 3: transformParserJson
          const games: ParsedGameData[] = await transformParserJson(parserResult.jsonFilePaths);

          // Step 4: validateParticipantCache (aborts immediately if any player is unregistered)
          safeSend({ type: 'stage', stage: 'validating' });
          safeSend({
            type: 'progress',
            percent: 70,
            message: 'Validating participants against database...'
          });

          const playerCache: Map<string, PlayerLookupResult> = await validateParticipantCache(
            games,
            repository
          );

          // Step 5: detectMultiAccountAnomalies (emits anomaly events)
          const anomalies = detectMultiAccountAnomalies(games, playerCache);
          for (const anomaly of anomalies) {
            safeSend({ type: 'anomaly', anomaly });
          }
          safeSend({
            type: 'progress',
            percent: 80,
            message: 'Participant validation and anomaly check complete'
          });

          // Step 6: repository.executeBatchInsert (atomic transaction, skips duplicates)
          safeSend({ type: 'stage', stage: 'persisting' });
          safeSend({
            type: 'progress',
            percent: 85,
            message: 'Persisting matches to database...'
          });

          const discordUserIds = Array.from(
            new Set(
              Array.from(playerCache.values())
                .map((p) => p.discordUserId)
                .filter(Boolean)
            )
          );
          const teamMap = await repository.findTeamMembershipsForDiscordUsers(discordUserIds);

          // Strict League Roster Forfeit Rule: check that every player belongs to a team membership
          for (const game of games) {
            for (const p of game.participants) {
              const key = `${p.gameName.trim().toLowerCase()}#${p.riotTag.trim().toLowerCase()}`;
              const lookup = playerCache.get(key);
              if (!lookup) continue;
              const teamId = teamMap.get(lookup.discordUserId);
              if (!teamId) {
                throw new Error(
                  `Roster violation: Player ${p.gameName}#${p.riotTag} is not registered in any team roster (forfeit / illegal roster).`
                );
              }
            }
          }

          const batchInsertResult = await repository.executeBatchInsert(
            games,
            playerCache,
            teamMap
          );

          // Step 7: Emit success with summary and cleanup tempDir
          safeSend({ type: 'stage', stage: 'completed' });
          safeSend({
            type: 'progress',
            percent: 100,
            message: 'Upload and ingestion completed successfully'
          });

          const distinctDiscordUsers = new Set(
            Array.from(playerCache.values())
              .map((p) => p.discordUserId)
              .filter(Boolean)
          );

          const summary: BatchUploadResult = {
            processedGames: batchInsertResult.insertedGames,
            detectedDiscordUsersCount: distinctDiscordUsers.size,
            detectedPlayersCount: playerCache.size,
            anomalies,
            skippedDuplicates: batchInsertResult.skippedDuplicates
          };

          safeSend({ type: 'success', summary });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          safeSend({ type: 'error', message });
        } finally {
          state = 'idle';
          await cleanupResources();
        }
        return;
      }

      safeSend({
        type: 'error',
        message: `Unknown message type: ${(clientMsg as { type?: string }).type ?? 'undefined'}`
      });
    });

    ws.on('close', async () => {
      state = 'closed';
      abortController.abort(new Error('Client disconnected abruptly'));
      await cleanupResources();
    });

    ws.on('error', async () => {
      state = 'closed';
      abortController.abort(new Error('Socket error'));
      await cleanupResources();
    });
  });

  return wss;
}
