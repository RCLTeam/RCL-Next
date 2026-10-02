# Validaciones y Reglas Deportivas

[⬅️ Volver a API ROFL Upload](README.md) | [Siguiente: Contratos ➡️](contracts.md)

---

## 1. Visión General

La ingesta de repeticiones en RCL-Next no se limita al desempaque de datos técnicos; aplica un conjunto riguroso de reglas de negocio deportivas diseñadas para asegurar la legalidad de los enfrentamientos y la consistencia de los rosters oficiales.

Esta capa se compone de tres mecanismos fundamentales:
1. **Validación Fail-Fast de Participantes Registrados** (`validate-participant-cache.ts`)
2. **Auditoría de Unanimidad de Equipo** (`postgres-rofl-upload.repository.ts`)
3. **Detección de Anomalías Multi-Cuenta** (`detect-multi-account-anomalies.ts`)

---

## 2. Validación Fail-Fast de Participantes Registrados

Para mantener la integridad relacional de la competición, ningún jugador anónimo o no registrado previamente en la liga puede formar parte de una partida oficial guardada en la base de datos.

La función `validateParticipantCache()` (`apps/api/src/modules/rofl-upload/validation/validate-participant-cache.ts:8-46`) opera de forma previa a la persistencia:
1. **Recolección Global:** Extrae todos los pares únicos `{ gameName, riotTag }` presentes en la totalidad de las partidas del lote (`validate-participant-cache.ts:8-20`).
2. **Inspección en Base de Datos:** Consulta al repositorio invocando `findPlayersByRiotIds()` con comparación insensible a mayúsculas (`validate-participant-cache.ts:27`).
3. **Comprobación de Cobertura:** Compara el conjunto de identidades solicitadas contra las identidades encontradas en la tabla `players`.
4. **Interrupción Inmediata:** Si falta al menos un participante:
   ```typescript
   // validate-participant-cache.ts:43-46
   throw new Error(
     `Validation failed: The following summoners are not registered in the database: ${missingPlayers.join(', ')}`
   );
   ```

> [!NOTE]
> **Comportamiento Específico:** La validación aborta la totalidad de la transacción de forma inmediata. Si un archivo `.rofl` de una serie de 3 partidas tiene 9 jugadores registrados y 1 no registrado, **ninguna partida de la serie se guarda en la base de datos**. El sistema no admite inserciones parciales ni deja marcadores a medias. La responsabilidad de dar de alta a los invocadores en la tabla `players` y asignarlos al roster recae en el administrador antes de proceder con la subida.

---

## 3. Validación de Unanimidad de Equipo y Roster Oficial

Antes de asignar los puntos de una partida en la serie, el repositorio valida que la alineación de cada lado corresponda estrictamente a un único equipo federado (`apps/api/src/modules/rofl-upload/persistence/postgres-rofl-upload.repository.ts:218-280`):

1. **Unanimidad Lado Azul:** Todos los jugadores del lado azul deben pertenecer al mismo equipo registrado en la base de datos (`blueTeamIds.size === 1`).
2. **Unanimidad Lado Rojo:** Todos los jugadores del lado rojo deben pertenecer al mismo equipo registrado en la base de datos (`redTeamIds.size === 1`).
3. **Equipos Distintos:** El equipo del lado azul no puede ser idéntico al del lado rojo (`blueTeamId !== redTeamId`).
4. **Alineación No Contaminada:** Si se detectan jugadores pertenecientes a un tercer equipo o sin membresía activa en el equipo en juego, la transacción se aborta con un mensaje descriptivo que desglosa el roster:
   ```typescript
   // postgres-rofl-upload.repository.ts:262-264
   throw new Error(
     `Validation failed: Blue team participants belong to multiple teams. Roster breakdown: [${breakdown.join(', ')}]`
   );
   ```

---

## 4. Detección de Anomalías Multi-Cuenta

En ligas competitivas es imprescindible auditar si una misma persona física jugó utilizando más de una cuenta simultáneamente en la misma partida (por ejemplo, para suplantar a un compañero o manipular el resultado).

El módulo `detect-multi-account-anomalies.ts` (`apps/api/src/modules/rofl-upload/validation/detect-multi-account-anomalies.ts:10-45`) analiza las partidas tras la resolución de identidades:
1. Mapea cada participante hacia su `discordUserId` resuelto a través de la relación de clave foránea `players.discord_user_id`.
2. Agrupa las cuentas utilizadas por cada usuario de Discord en cada partida:
   ```typescript
   // detect-multi-account-anomalies.ts:37-45
   if (entry.accounts.length > 1) {
     anomalies.push({
       gameFile: game.fileName,
       discordUserId,
       discordUsername: entry.discordUsername,
       accounts: entry.accounts
     });
   }
   ```

> [!WARNING]
> **Comportamiento Específico:** A diferencia del error por invocadores no registrados, **la detección de anomalías multi-cuenta NO aborta la transacción ni detiene la inserción en base de datos** (`rofl-upload.gateway.ts:299-302`).
> - Las partidas se insertan con normalidad para evitar bloqueos operativos.
> - El gateway emite inmediatamente un evento WebSocket de tipo `{ type: 'anomaly', anomaly }` hacia la consola de la interfaz de usuario.
> - Las anomalías detectadas se adjuntan en el resumen final `BatchUploadSummary.anomalies` para que el cuerpo arbitral y los administradores inicien los expedientes sancionadores oportunos.
