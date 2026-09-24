import type { WsClientMessage, WsServerEvent } from '@rcl/contracts';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { initialUploadState, uploadReducer } from '../state/upload-reducer.js';
import type { UploadState } from '../types/upload.types.js';

export interface UseRoflUploadWsOptions {
  wsUrl?: string | undefined;
  chunkSize?: number | undefined;
}

export interface UseRoflUploadWsReturn {
  state: UploadState;
  uploadFile: (file: File) => Promise<void>;
  reset: () => void;
}

export function useRoflUploadWs(options?: UseRoflUploadWsOptions): UseRoflUploadWsReturn {
  const [state, dispatch] = useReducer(uploadReducer, initialUploadState);
  const wsRef = useRef<WebSocket | null>(null);
  const isUploadingRef = useRef(false);
  const bufferedLogsRef = useRef<string[]>([]);
  const logTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushLogs = useCallback(() => {
    if (bufferedLogsRef.current.length > 0) {
      const logsToFlush = [...bufferedLogsRef.current];
      bufferedLogsRef.current = [];
      dispatch({ type: 'batch_logs', logs: logsToFlush });
    }
    if (logTimerRef.current) {
      clearTimeout(logTimerRef.current);
      logTimerRef.current = null;
    }
  }, []);

  const queueLog = useCallback(
    (log: string) => {
      bufferedLogsRef.current.push(log);
      if (!logTimerRef.current) {
        logTimerRef.current = setTimeout(() => {
          flushLogs();
        }, 50);
      }
    },
    [flushLogs]
  );

  const reset = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close(1000, 'User reset');
      } catch {
        // Ignore closing already closed socket
      }
      wsRef.current = null;
    }
    isUploadingRef.current = false;
    bufferedLogsRef.current = [];
    if (logTimerRef.current) {
      clearTimeout(logTimerRef.current);
      logTimerRef.current = null;
    }
    dispatch({ type: 'reset' });
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, 'Component unmounted');
        } catch {
          // Ignore
        }
        wsRef.current = null;
      }
      if (logTimerRef.current) {
        clearTimeout(logTimerRef.current);
        logTimerRef.current = null;
      }
    };
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith('.rofl') && !lowerName.endsWith('.zip')) {
        dispatch({
          type: 'error',
          message: `Unsupported file type: expected .rofl or .zip, received '${file.name}'`
        });
        return;
      }

      if (isUploadingRef.current) {
        return;
      }
      isUploadingRef.current = true;

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // Ignore
        }
        wsRef.current = null;
      }

      dispatch({ type: 'start', filename: file.name });

      let targetWsUrl = options?.wsUrl;
      if (!targetWsUrl) {
        const win =
          typeof globalThis !== 'undefined'
            ? (
                globalThis as unknown as {
                  window?: { location?: { protocol?: string; host?: string } };
                }
              ).window
            : undefined;

        if (win?.location?.host) {
          const wsProtocol = win.location.protocol === 'https:' ? 'wss:' : 'ws:';
          targetWsUrl = `${wsProtocol}//${win.location.host}/ws/rofl-upload`;
        } else {
          targetWsUrl = 'ws://localhost:3000/ws/rofl-upload';
        }
      }

      let socket: WebSocket;
      try {
        socket = new WebSocket(targetWsUrl);
        socket.binaryType = 'arraybuffer';
        wsRef.current = socket;
      } catch (err) {
        isUploadingRef.current = false;
        const msg = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'error', message: `Failed to connect to WebSocket: ${msg}` });
        return;
      }

      let terminalStateReached = false;

      socket.onopen = () => {
        socket.send(
          JSON.stringify({ type: 'start', filename: file.name } satisfies WsClientMessage)
        );
      };

      socket.onmessage = async (event) => {
        try {
          const rawText =
            typeof event.data === 'string'
              ? event.data
              : new TextDecoder('utf8').decode(event.data);
          const payload = JSON.parse(rawText) as WsServerEvent;

          switch (payload.type) {
            case 'started': {
              dispatch({ type: 'started', filename: payload.filename });

              // High-performance binary chunk streaming via Blob.slice()
              const chunkSize = options?.chunkSize ?? 64 * 1024; // 64 KB slices
              let offset = 0;
              const totalSize = file.size;

              try {
                while (offset < totalSize && socket.readyState === WebSocket.OPEN) {
                  const end = Math.min(offset + chunkSize, totalSize);
                  const slice = file.slice(offset, end);
                  const arrayBuffer = await slice.arrayBuffer();

                  // Respect WebSocket buffer backpressure
                  const backpressureStart = Date.now();
                  while (
                    socket.readyState === WebSocket.OPEN &&
                    socket.bufferedAmount > 256 * 1024
                  ) {
                    if (Date.now() - backpressureStart > 15000) {
                      throw new Error(
                        'Upload backpressure timeout: network stalled for over 15 seconds'
                      );
                    }
                    await new Promise((resolve) => setTimeout(resolve, 10));
                  }

                  if (socket.readyState !== WebSocket.OPEN) {
                    break;
                  }

                  socket.send(arrayBuffer);
                  offset = end;

                  const uploadPercent = Math.min(99, Math.round((offset / totalSize) * 100));
                  queueLog(
                    `[UPLOAD] Streaming chunks: ${uploadPercent}% (${Math.round(offset / 1024)} KB / ${Math.round(totalSize / 1024)} KB)`
                  );
                }

                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({ type: 'finish' } satisfies WsClientMessage));
                }
              } catch (streamErr) {
                flushLogs();
                terminalStateReached = true;
                isUploadingRef.current = false;
                const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
                dispatch({ type: 'error', message: errMsg });
                try {
                  socket.close(1000, 'Upload error');
                } catch {
                  // Ignore socket close failure
                }
              }
              break;
            }

            case 'queue': {
              flushLogs();
              dispatch({
                type: 'queue',
                position: payload.position,
                total: payload.total
              });
              break;
            }

            case 'stage': {
              flushLogs();
              dispatch({ type: 'stage', stage: payload.stage });
              break;
            }

            case 'progress': {
              flushLogs();
              dispatch({
                type: 'progress',
                percent: payload.percent,
                message: payload.message
              });
              break;
            }

            case 'warning': {
              flushLogs();
              dispatch({ type: 'warning', message: payload.message });
              break;
            }

            case 'anomaly': {
              flushLogs();
              dispatch({
                type: 'anomaly',
                anomaly: payload.anomaly
              });
              break;
            }

            case 'success': {
              flushLogs();
              terminalStateReached = true;
              isUploadingRef.current = false;
              dispatch({ type: 'success', summary: payload.summary });
              socket.close(1000, 'Upload finished');
              break;
            }

            case 'error': {
              flushLogs();
              terminalStateReached = true;
              isUploadingRef.current = false;
              dispatch({ type: 'error', message: payload.message });
              socket.close(1000, 'Error encountered');
              break;
            }

            default:
              break;
          }
        } catch {
          // Ignore malformed messages
        }
      };

      socket.onclose = (event) => {
        flushLogs();
        isUploadingRef.current = false;
        if (!terminalStateReached && event.code !== 1000) {
          dispatch({
            type: 'connection_lost',
            code: event.code,
            reason: event.reason || undefined,
            message: event.reason || undefined
          });
        }
      };

      socket.onerror = () => {
        flushLogs();
        isUploadingRef.current = false;
        if (!terminalStateReached) {
          dispatch({
            type: 'connection_lost',
            message: 'Conexión interrumpida, por favor reintente'
          });
        }
      };
    },
    [options?.wsUrl, options?.chunkSize, flushLogs, queueLog]
  );

  return {
    state,
    uploadFile,
    reset
  };
}
