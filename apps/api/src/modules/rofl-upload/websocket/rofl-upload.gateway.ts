import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { BatchUploadSummary, WsClientMessage, WsServerEvent } from '@rcl/contracts';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import type { AuthService } from '../../auth/auth.service.js';
import { readSessionCookie } from '../../auth/session-cookie.js';
import type { RoflUploadRepository } from '../persistence/rofl-upload.repository.js';
import { executePythonParser } from '../processing/execute-python-parser.js';
import { cleanupTempDir, processBatchFiles } from '../processing/process-batch-files.js';
import { transformParserJson } from '../processing/transform-parser-json.js';
import { RoflUploadDomainError } from '../types/rofl-upload.errors.js';
import type { ParsedGameData, PlayerLookupResult } from '../types/rofl-upload.types.js';
import { detectMultiAccountAnomalies } from '../validation/detect-multi-account-anomalies.js';
import { validateParticipantCache } from '../validation/validate-participant-cache.js';

export interface RoflUploadGatewayOptions {
  path?: string | undefined;
  pythonScriptPath?: string | undefined;
  pythonExecutable?: string | undefined;
  concurrency?: number | undefined;
  authService?: AuthService | undefined;
  /**
   * Same value as the HTTP API (`AuthOptions.secureCookies`): with it only `__Host-rcl_session` is
   * read, without it only `rcl_session`. A duplicated session cookie is always rejected.
   */
  secureCookies?: boolean | undefined;
  /**
   * Only origin allowed to open the socket (the frontend, `CORS_ORIGIN`). It is compared with the
   * handshake `Origin` header by strict equality, like `requireTrustedOrigin` does for HTTP
   * mutations. Without it every handshake is rejected.
   */
  frontendOrigin?: string | undefined;
  /**
   * Test-only escape hatch: accept connections without a session when no `authService` is given.
   * The server never sets it; without `authService` and without this flag every handshake is
   * rejected with 503.
   */
  allowUnauthenticated?: boolean | undefined;
  /** Records the detail of an unexpected failure. Defaults to `console.error`. */
  logIncident?: ((incidentId: string, context: string, error: unknown) => void) | undefined;
}

export const UNEXPECTED_UPLOAD_ERROR_MESSAGE =
  'Unexpected server error while processing the upload. Contact an administrator with the incident ID';

function defaultLogIncident(incidentId: string, context: string, error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[INCIDENT ${incidentId}] Type: ROFL_UPLOAD_${context} | Message: ${detail}`);
}

export function attachRoflUploadGateway(
  server: http.Server,
  repository: RoflUploadRepository,
  options?: RoflUploadGatewayOptions
): WebSocketServer {
  const wsPath = options?.path ?? '/ws/rofl-upload';
  const allowUnauthenticated = options?.allowUnauthenticated === true;
  const authService = options?.authService;
  const frontendOrigin = options?.frontendOrigin;
  const logIncident = options?.logIncident ?? defaultLogIncident;
  const wss = new WebSocketServer({
    server,
    path: wsPath,
    // Runs before the upgrade is accepted, so rejected handshakes never reach authorize().
    verifyClient: (info, callback) => {
      if (!authService && !allowUnauthenticated) {
        callback(false, 503, 'Authentication is not configured');
        return;
      }
      if (!frontendOrigin || info.req.headers.origin !== frontendOrigin) {
        callback(false, 403, 'Request origin is not allowed');
        return;
      }
      callback(true);
    }
  });

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

  wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
    const sessionToken = readSessionCookie(req.headers.cookie, options?.secureCookies === true);
    async function authorize(): Promise<boolean> {
      if (!authService) {
        if (allowUnauthenticated) return true;
        ws.close(4001, 'Unauthorized: Authentication is not configured');
        return false;
      }
      if (!sessionToken) {
        ws.close(4001, 'Unauthorized: Missing session cookie');
        return false;
      }
      const user = await authService.currentUser(sessionToken).catch(() => null);
      if (!user) {
        ws.close(4001, 'Unauthorized: Invalid or expired session');
        return false;
      }
      if (user.role !== 'admin' && user.role !== 'owner') {
        ws.close(4003, 'Forbidden: Admin role required');
        return false;
      }
      return true;
    }
    if (!(await authorize())) return;
    let state: 'idle' | 'uploading' | 'processing' | 'closed' = 'idle';
    let sessionDir: string | null = null;
    let batchTempDir: string | null = null;
    let fileWriteStream: fsSync.WriteStream | null = null;
    let safeFileName: string | null = null;
    let receivedBytes = 0;
    const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB
    const abortController = new AbortController();

    function safeSend(message: WsServerEvent): void {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }

    /** Logs the detail server-side and sends the client only a generic message with its id. */
    function sendIncident(context: string, error: unknown): void {
      const incidentId = crypto.randomUUID();
      logIncident(incidentId, context, error);
      safeSend({
        type: 'error',
        message: `${UNEXPECTED_UPLOAD_ERROR_MESSAGE} (${incidentId}).`,
        incidentId
      });
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

        receivedBytes += buffer.length;
        if (receivedBytes > MAX_UPLOAD_BYTES) {
          safeSend({
            type: 'error',
            message: 'File exceeds maximum upload size (50MB)'
          });
          await cleanupResources();
          state = 'closed';
          ws.close(1009, 'Message too big');
          return;
        }

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
      let clientMsg: WsClientMessage;
      try {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        clientMsg = JSON.parse(text) as WsClientMessage;
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
            sendIncident('DISK_WRITE', err);
          });
          receivedBytes = 0;
          state = 'uploading';
          safeSend({ type: 'started', filename: safeFileName });
        } catch (err) {
          sendIncident('INIT_UPLOAD_DIR', err);
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
          sendIncident('FLUSH_FILE', err);
          await cleanupResources();
          state = 'idle';
          return;
        }

        try {
          // Step 1: processBatchFiles with decompression queue positional updates for .zip
          if (!(await authorize())) return;
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
                throw new RoflUploadDomainError(
                  `Roster violation: Player ${p.gameName}#${p.riotTag} is not registered in any team roster (forfeit / illegal roster).`
                );
              }
            }
          }

          if (!(await authorize())) return;
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

          const summary: BatchUploadSummary = {
            processedGames: batchInsertResult.insertedGames,
            detectedDiscordUsersCount: distinctDiscordUsers.size,
            detectedPlayersCount: playerCache.size,
            anomalies,
            skippedDuplicates: batchInsertResult.skippedDuplicates
          };

          safeSend({ type: 'success', summary });
        } catch (err: unknown) {
          if (err instanceof RoflUploadDomainError) {
            safeSend({ type: 'error', message: err.message });
          } else if (!abortController.signal.aborted) {
            // Parser, filesystem and database failures: keep their detail out of the client.
            sendIncident('PROCESSING', err);
          }
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
