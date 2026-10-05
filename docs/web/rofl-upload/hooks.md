# Headless Hook WebSocket (`useRoflUploadWs`)

[⬅️ Volver a Web ROFL Upload](README.md) | [Siguiente: Páginas y Enrutamiento ➡️](pages.md)

---

## 1. Visión General

El hook `useRoflUploadWs` (`apps/web/src/features/rofl-upload/hooks/useRoflUploadWs.ts`) es el único punto de contacto con la red y el protocolo WebSocket de todo el frontend de subida de repeticiones. Al estar implementado como un **Headless Hook** puro, abstrae completamente la gestión de sockets, el streaming binario, la regulación de contrapresión del navegador y el formateo de logs, exponiendo una API minimalista y tipada:

```typescript
// useRoflUploadWs.ts:11-15
export interface UseRoflUploadWsReturn {
  state: UploadState;
  uploadFile: (file: File) => Promise<void>;
  reset: () => void;
}
```

---

## 2. Resolución Dinámica de la URL del WebSocket

El hook determina la dirección del gateway con la función pura exportada `resolveRoflUploadWsUrl(wsUrl, location)` (`useRoflUploadWs.ts:29-37`), que `uploadFile` invoca antes de marcar la subida como iniciada (`useRoflUploadWs.ts:125-130`):
- Si se proporciona `options.wsUrl`, se utiliza dicho valor explícito.
- En caso contrario, inspecciona `window.location`:
  - Si el protocolo es `https:`, establece `wss:`.
  - Si el protocolo es `http:`, establece `ws:`.
  - Apunta a `${protocol}//${window.location.host}/ws/rofl-upload`, es decir, al mismo host que sirve la página. Así la cabecera `Origin` del handshake coincide con el origen del frontend que exige el gateway, y en desarrollo el proxy de Vite (`apps/web/vite.config.ts`) redirige `/ws/rofl-upload` desde el puerto 5173 a la API en el 3001.
- Sin `options.wsUrl` y sin `window.location.host` (fuera del navegador, por ejemplo en SSR o en pruebas unitarias) no hay dirección válida: la función devuelve `null` y el hook despacha la acción `error` con el mensaje `MISSING_WS_URL_MESSAGE` (`useRoflUploadWs.ts:22-23`) sin crear ningún `WebSocket` ni pasar por el estado `uploading`.
- Pruebas: `tests/unit/useRoflUploadWs.test.ts` cubre `resolveRoflUploadWsUrl` y `tests/unit/render/rofl-upload.test.tsx` comprueba que `uploadFile` no crea ningún `WebSocket` en ese caso.

---

## 3. Streaming Binario por Chunks (64 KB)

Al invocar `uploadFile(file)` tras la apertura del socket (`socket.onopen`):
1. Envía el mensaje de control inicial: `{"type": "start", "filename": file.name}` (`useRoflUploadWs.ts:157-161`).
2. Al recibir el evento `{ type: 'started' }` del servidor, inicia el bucle de transmisión fragmentada:
   ```typescript
   // useRoflUploadWs.ts:176-185
   const chunkSize = options?.chunkSize ?? 64 * 1024; // 64 KB por fragmento
   let offset = 0;
   const totalSize = file.size;

   while (offset < totalSize && socket.readyState === WebSocket.OPEN) {
     const end = Math.min(offset + chunkSize, totalSize);
     const slice = file.slice(offset, end);
     const arrayBuffer = await slice.arrayBuffer();
     ...
     socket.send(arrayBuffer);
     offset = end;
   }
   ```
3. Una vez transmitido el último chunk, envía el mensaje de fin de subida: `{"type": "finish"}` (`useRoflUploadWs.ts:214`).

---

## 4. Mitigación de Contrapresión de Red (Backpressure)

Si el cliente envía fragmentos binarios a una velocidad superior a la capacidad de transmisión del canal de red o el servidor se demora en procesarlos, el búfer de salida del socket en el navegador (`socket.bufferedAmount`) comenzará a crecer, lo que puede provocar congelación de memoria o desconexiones abruptas.

Para prevenir esta anomalía, el hook implementa un bucle de espera activa con temporizador de seguridad (`useRoflUploadWs.ts:187-198`):
```typescript
const backpressureStart = Date.now();
while (
  socket.readyState === WebSocket.OPEN &&
  socket.bufferedAmount > 256 * 1024 // Umbral de contrapresión: 256 KB
) {
  if (Date.now() - backpressureStart > 15000) {
    throw new Error(
      'Upload backpressure timeout: network stalled for over 15 seconds'
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
}
```
- **Umbral de Freno:** Si el búfer supera **256 KB**, suspende el bucle de envío y cede el control durante 10 ms para permitir que el navegador vacíe la cola de transmisión.
- **Timeout Duro de 15 Segundos:** Si la red permanece bloqueada durante más de 15 segundos sin drenar el búfer, interrumpe la subida arrojando un error explícito.

---

## 5. Debounce de Registros de Terminal (Prevención de Re-renders)

Durante la subida de un archivo de 40 MB en bloques de 64 KB se generan más de 600 eventos de progreso. Despachar una acción de Redux o de `useReducer` por cada chunk saturaría el hilo principal de React provocando pérdida de fluidez (*frame drops*).

El hook soluciona este cuello de botella mediante una cola en memoria con despacho en lotes cada 50 ms (`useRoflUploadWs.ts:48-73`):
```typescript
const bufferedLogsRef = useRef<string[]>([]);
const logTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const queueLog = useCallback((log: string) => {
  bufferedLogsRef.current.push(log);
  if (!logTimerRef.current) {
    logTimerRef.current = setTimeout(() => {
      flushLogs();
    }, 50); // Despacho batch cada 50 ms
  }
}, [flushLogs]);
```
Esto compacta cientos de registros en actualizaciones periódicas agrupadas (`type: 'batch_logs'`), manteniendo una experiencia fluida a 60 FPS en la interfaz visual.

---

## 6. Limpieza de Recursos y Desconexión

El hook garantiza la ausencia de fugas de memoria o sockets huérfanos mediante:
1. **Método `reset()`:** Cierra explícitamente el socket activo con código estándar `1000 ('User reset')`, cancela temporizadores pendientes y reinicia el estado a `initialUploadState` (`useRoflUploadWs.ts:75-91`).
2. **Efecto de Desmontaje (`useEffect`):** Al desmontar el componente que consume el hook, se cierran las conexiones de red y se destruyen los temporizadores de debounce (`useRoflUploadWs.ts:93-108`).
