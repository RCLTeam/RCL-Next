# Contratos y DTOs de Integración

[⬅️ Volver a API ROFL Upload](README.md) | [Siguiente: Frontend ROFL Upload ➡️](../../web/rofl-upload/README.md)

---

## 1. Visión General

El subsistema de ingesta de repeticiones define sus contratos de comunicación a través del paquete compartido `@rcl/contracts` (`packages/contracts/src/rofl-upload.ts`) y de tipos internos de dominio en `apps/api/src/modules/rofl-upload/types/rofl-upload.types.ts`. Estos contratos aseguran un acoplamiento débil pero fuertemente tipado en TypeScript entre el cliente React, el gateway WebSocket y la capa de persistencia.

---

## 2. Contratos Públicos del Protocolo WebSocket (`@rcl/contracts`)

### 2.1 Mensajes Enviados por el Cliente (`WsClientMessage`)
```typescript
// packages/contracts/src/rofl-upload.ts:76-85
export type WsClientStartMessage = {
  type: 'start';
  filename: string;
};

export type WsClientFinishMessage = {
  type: 'finish';
};

export type WsClientMessage = WsClientStartMessage | WsClientFinishMessage;
```

### 2.2 Eventos Emitidos por el Servidor (`WsServerEvent`)
```typescript
// packages/contracts/src/rofl-upload.ts:21-74
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
  /** Present only for unexpected server failures; the detail is in the server log under this id. */
  incidentId?: string;
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
```

### 2.3 Estructura de Resumen de Subida y Anomalías
```typescript
// packages/contracts/src/rofl-upload.ts:1-19
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
```

---

## 3. Tipos Internos del Backend (`rofl-upload.types.ts`)

Definidos en `apps/api/src/modules/rofl-upload/types/rofl-upload.types.ts:1-65`:

### 3.1 `PlayerLookupResult`
Resultado de la búsqueda y cruce en base de datos de invocadores y usuarios de Discord:
```typescript
export interface PlayerLookupResult {
  playerId: string;
  discordUserId: string;
  discordUsername: string;
  gameName: string;
  riotTag: string;
}
```

### 3.2 `ParticipantRunes` y `ParticipantBuild`
Representación normalizada de runas e inventario previa a la inserción en `player_game_runes` y `player_game_build`:
- `ParticipantRunes`: almacena `primaryKeystoneId`, `primaryPerk`, `primaryPerk1..3`, `secundaryRuneId`, `secundaryPerk1..2`, `statPerkOffense`, `statPerkFlex`, `statPerkDefense`.
- `ParticipantBuild`: almacena `item0..5`, `trinket`, `summonerSpell1Id`, `summonerSpell2Id`.

### 3.3 `ParsedGameData`
Estructura intermedia generada por `transformParserJson`:
```typescript
export interface ParsedGameData {
  fileName: string;
  externalGameId: string;
  durationSeconds: number;
  winnerSide: 'blue' | 'red';
  participants: ParsedParticipantData[];
  gameCreation?: number;
}
```

---

## 4. Matriz de Compatibilidad entre Paquetes

| Tipo de Datos | Paquete Origen | Consumidor Primario | Validación en Runtime |
|---|---|---|---|
| `WsClientMessage` | `@rcl/contracts` | `apps/api` (WebSocket Gateway) | `JSON.parse` + type discriminator |
| `WsServerEvent` | `@rcl/contracts` | `apps/web` (`useRoflUploadWs`) | `JSON.parse` + type discriminator |
| `BatchUploadSummary` | `@rcl/contracts` | `apps/web` (`BatchSummaryCard`) | TypeScript Static Typecheck |
| `MultiAccountAnomaly`| `@rcl/contracts` | `apps/web` (`AnomalyAlerts`) | TypeScript Static Typecheck |
| `ParsedGameData` | `apps/api` (local) | `PostgresRoflUploadRepository` | Esquema Zod / Type assertions |
