# Contratos TypeScript y Mapeo de DTOs (`@rcl/contracts`)

[⬅️ Volver a Documentación de Base de Datos](./README.md) | [Siguiente: Comparativa con Esquema Histórico ➡️](../reference/README.md)

---

## 1. El Paquete `@rcl/contracts`

El paquete `packages/contracts/` proporciona la capa de contratos de tipos compartida entre el backend (`apps/api`), el frontend (`apps/web`) y los subprocesos de procesamiento.
- **Cero Dependencias de Runtime:** Compila exclusivamente definiciones de tipos TypeScript e interfaces sin dependencias pesadas, garantizando tiempos de compilación mínimos e interoperabilidad limpia.
- **Segregación de Modelos:** Los DTOs aíslan el modelo de datos relacional de PostgreSQL frente a las respuestas JSON expuestas a través de la API REST y las conexiones WebSocket.

---

## 2. Reglas de Serialización y Transformación de Tipos

Al transformar las filas de la base de datos (Drizzle ORM) a los DTOs de `@rcl/contracts`, se aplican tres reglas fundamentales de serialización:

1. **Snowflakes de Discord (`BigInt` a `string`):** Las columnas de 64 bits (`teams.discord_role_id` y `matches.discord_channel_id`), aunque gestionadas como `bigint` en el driver de base de datos, se serializan como cadenas de texto (`string`) en los DTOs para evitar que `JSON.stringify()` arroje un `TypeError` (`Do not know how to serialize a BigInt`).
2. **Marcas Temporales (`Date` / `timestamptz` a ISO 8601):** Las columnas temporales se transforman a cadenas de fecha con zona horaria en formato ISO 8601 UTC (ej. `'2026-09-30T19:30:00.000Z'`).
3. **Documentos JSONB Estructurados:** Las columnas JSONB (`home_weekly_teams.players` y `audit_logs.before` / `after`) se tipan fuertemente en tiempo de compilación mediante interfaces TypeScript específicas.

---

## 3. Matriz de Trazabilidad entre Tablas y Contratos DTO

| Módulo de Contrato | Tipos / Interfaces Exportadas | Archivo de Contrato | Tablas de Base de Datos Relacionadas | Mapeo y Responsabilidad |
|---|---|---|---|---|
| **Autenticación** | `AuthUser` | `packages/contracts/src/auth.ts:1-7` | `discord_users` | Mapea `discordId`, `username`, `globalName`, `avatarHash` y `role` (`'viewer'`, `'admin'`, `'owner'`). |
| **Roles de Miembros** | `MemberRole`, `RoleMember`, `MemberRolesPage`, `ChangeMemberRole` | `packages/contracts/src/member-roles.ts:3-17` | `discord_users` | Gestión y paginación administrativa de roles de usuario. |
| **Perfiles Deportivos** | `TeamSummary`, `TeamDetail`, `TeamMember`, `PlayerTeam`, `Player`, `PlayerStatistics`, `PlayerDetail` | `packages/contracts/src/competition-profiles.ts:1-77` | `teams`, `team_memberships`, `discord_users`, `players`, `seasons_divisions` | Ensambla la vista pública de clubes y perfiles de jugadores, calculando KDA, winrate y estadísticas acumuladas. |
| **Detalle de Partidos** | `MatchStatKey`, `MatchPlayerStats`, `MatchPlayerBuild`, `MatchPlayerRunes`, `MatchParticipant`, `MatchMap`, `MatchDetail` | `packages/contracts/src/match-detail.ts:1-103` | `matches`, `match_games`, `player_game_info`, `player_game_build`, `player_game_runes`, `player_game_stats`, `teams`, `rounds` | Expone el desglose integral de una serie competitiva, mapas disputados, bans, objetos, runas y las 43 métricas de partida. |
| **Pronósticos** | `PredictionPick`, `PredictionSummary`, `PredictorStanding`, `PredictionsData` | `packages/contracts/src/predictions.ts:1-27` | `predictions`, `matches`, `teams`, `discord_users` | Envío de votos por encuentro, porcentajes comunitarios de victoria y tabla clasificatoria de pronosticadores. |
| **Contenido Editorial** | `EditorialKind`, `EditorialInput`, `EditorialArticle`, `WeeklyPlayer`, `WeeklyTeamInput`, `WeeklyTeam`, `WeeklyCandidate` | `packages/contracts/src/home-content.ts:1-50` | `editorial_articles`, `home_weekly_teams`, `rounds`, `seasons_divisions` | Artículos de la página de inicio y selección del Equipo de la Semana por jornada y división. |
| **Panel CRUD** | `CrudValue`, `CrudRecord`, `CrudField`, `CrudResource`, `CrudPageResult`, `CrudDeleteImpact`, `CrudDeletePreview` | `packages/contracts/src/crud-operations.ts:1-41` | Transversal (las 21 tablas relacionales) | Motor genérico del panel de administración que inspecciona claves foráneas y calcula el impacto de borrado en cascada antes de eliminar registros. |
| **Transferencia de BD** | `DatabaseImportTable`, `DatabaseImportPreview`, `DatabaseImportResult` | `packages/contracts/src/database-transfer.ts:1-13` | Transversal | Previsualización y validación de tablas durante importaciones masivas o volcados de datos. |
| **Puente Discord** | `BridgeHealthResponse`, tramas WebSocket (`BridgeQueuedFrame`, `BridgeLoginFrame`, etc.) | `packages/contracts/src/discord-bridge.ts:6-100` | Sincronización externa con Discord | Protocolo de comunicación bidireccional entre el bot de Discord y el backend API. |
| **Procesador ROFL** | Eventos WS (`WsServerStartedEvent`, `WsServerStageEvent`, etc.), `BatchUploadSummary`, `MultiAccountAnomaly` | `packages/contracts/src/rofl-upload.ts:1-83` | `player_game_*`, `match_games`, `players` | Protocolo de streaming WebSocket durante la descompresión y carga de repeticiones ROFL. |
| **Buzón de Sugerencias**| `SuggestionStatus`, `CreateSuggestionRequest`, `CreateSuggestionResponse`, `SuggestionStatusResponse` | `packages/contracts/src/suggestions.ts:6-30` | `discord_users` (vía bridge) | Creación y seguimiento de sugerencias comunitarias enviadas a hilos de Discord. |
| **Estadísticas Campeón**| `ChampionStats` | `packages/contracts/src/champion-stats.ts:1-9` | Derivado de `player_game_info` y `match_games` | Métricas agregadas de rendimiento por campeón (partidas jugadas, victorias, derrotas, winrate, KDA medio). |

---

## 4. Ejemplos de Mapeo de Modelos Complejos

### 4.1 Desglose de Participante en Partida (`MatchParticipant`)
En `packages/contracts/src/match-detail.ts:74-88`, el DTO combina las cuatro tablas relacionales de la instantánea de jugador:
```typescript
export interface MatchParticipant {
  id: string;              // player_game_info.id
  playerId: string;        // player_game_info.player_id
  teamId: string;          // player_game_info.team_id
  side: 'blue' | 'red';    // player_game_info.side (game_side)
  champion: string;        // player_game_info.champion
  position: string | null; // player_game_info.position
  stats: MatchPlayerStats; // player_game_stats (43 métricas mapeadas)
  build: MatchPlayerBuild; // player_game_build (item_0..item_5, trinket, spells)
  runes: MatchPlayerRunes; // player_game_runes (perks primarios, secundarios y fragmentos)
}
```

### 4.2 Equipo de la Semana (`WeeklyTeam`)
En `packages/contracts/src/home-content.ts:32-41`, `WeeklyTeam` deserializa la columna `jsonb` de `home_weekly_teams.players`:
```typescript
export interface WeeklyPlayer {
  role: 'top' | 'jungle' | 'mid' | 'adc' | 'support';
  name: string;
  team: string;
  imageUrl: string;
  playerId?: string;
  teamId?: string;
  champions?: string[];
}

export interface WeeklyTeam {
  id: string;
  divisionId: string;
  roundId: number | null;
  label: string;
  published: boolean;
  players: WeeklyPlayer[]; // Mapeo del documento JSONB
  updatedAt: string;
}
```
