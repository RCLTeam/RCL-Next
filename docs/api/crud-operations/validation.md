# Validación y Reglas de Dominio: CRUD Operations API

[⬅️ Volver a Persistencia](persistence.md) | [Siguiente: Contratos y DTOs ➡️](contracts.md)

---

## 1. Resumen de la Capa de Validación

La validación del motor CRUD opera como un sistema de filtrado multicapa que combina esquemas Zod fuertemente tipados (`apps/api/src/modules/crud-operations/crud-operations.resources.ts`), validadores de integridad relacional en el servicio (`crud-operations.service.ts`) y restricciones de acceso por rol en el router.

Todas las peticiones entrantes se someten al principio *fail-fast*: cualquier discrepancia en tipos, campos mutables restringidos, fechas imposibles o violaciones de claves primarias interrumpe el procesamiento antes de alcanzar la base de datos relacional.

---

## 2. Catálogo de Recursos y Esquemas Zod

### 2.1 Lista Blanca de Recursos (`crudResources`)
El motor solo permite mutaciones sobre los 8 recursos explícitamente registrados en `crudResources` (`crud-operations.resources.ts:60-249`). La entidad `users` (`schema.discordUsers`) está configurada en `crudReferences` únicamente para lecturas auxiliares en selectores de formulario.

### 2.2 Especificación de Validaciones por Recurso

#### A. Temporadas (`seasons`)
- `id`: Entero positivo `1..99`.
- `name`: Cadena obligatoria, longitud máxima 80 caracteres.
- `split`: Enumerado estricto `['split1', 'split2']`.
- `startsOn`: Cadena de fecha en formato ISO-8601 (`YYYY-MM-DD`).
- `endsOn`: Cadena de fecha en formato ISO-8601 (`YYYY-MM-DD`).
- **Regla de Dominio:** `endsOn >= startsOn` (`AppError(422, 'INVALID_DATES')`).

#### B. Divisiones (`divisions`)
- `id`: Entero positivo `1..99`.
- `name`: Cadena obligatoria, longitud máxima 80 caracteres.
- `tier`: Enumerado estricto `['tier1', 'tier2', 'tier3', 'tier4']`.

#### C. Competiciones (`competitions` / `seasons_divisions`)
- Clave primaria compuesta: `[idSeason, idDivision]`.
- `idSeason`: Entero correspondiente a una temporada existente.
- `idDivision`: Entero correspondiente a una división existente.
- `orderIndex`: Entero de ordenación visual.
- `playoffsConfig`: Objeto JSON opcional validado para configuración de eliminatorias.

#### D. Equipos (`teams`)
- `id`: Identificador en formato *slug* kebab-case (`/^[a-z0-9-]+$/`), longitud máxima 50.
- `name`: Cadena obligatoria, longitud máxima 80.
- `tag`: Siglas del equipo en mayúsculas, longitud 2 a 5 caracteres (`/^[A-Z0-9]{2,5}$/`).
- `logoUrl`: URL válida con protocolo `https://`.

#### E. Jugadores (`players`)
- `id`: Discord Snowflake numérico (`/^\d{17,20}$/`).
- `gameName`: Nombre de invocador de Riot, longitud máxima 50.
- `riotTag`: Etiqueta de Riot (ej. `EUW`, `RCL`), longitud máxima 10.
- `primaryRole`: Rol de juego (`top`, `jungle`, `mid`, `adc`, `support`).
- `secondaryRole`: Rol secundario opcional.
- `elo`: Entero positivo representativo del nivel competitivo.

#### F. Plantillas de Equipo (`memberships` / `team_memberships`)
- Clave primaria compuesta: `[teamId, discordUserId]`.
- `teamId`: Identificador del equipo.
- `discordUserId`: Snowflake del usuario de Discord.
- `role`: Rol en la plantilla (`player`, `substitute`, `coach`, `staff`, `manager`).
- `isCaptain`: Booleano que indica capitanía.

#### G. Jornadas (`rounds`)
- Clave primaria compuesta: `[id, idSeasonDivision]`.
- `id`: Número de jornada (entero positivo).
- `idSeasonDivision`: Clave foránea que referencia a `seasons_divisions`.
- `stage`: Enumerado de fase (`regular`, `tiebreaker`, `quarterfinals`, `semifinals`, `final`).
- `scheduledDate`: Fecha u hora planificada.

#### H. Partidos (`matches`)
- `id`: Identificador entero.
- `idSeasonDivision`: Clave foránea a la competición.
- `roundId`: Número de jornada.
- `team1Id` y `team2Id`: Equipos rivales. **Regla:** `team1Id !== team2Id`.
- `bestOf`: Formato al mejor de N (`1`, `3` o `5`).
- `status`: Estado del partido (`scheduled`, `completed`, `forfeit`, `live`).
- `winnerTeamId`: Si se especifica, debe coincidir con `team1Id` o `team2Id`.
- `team1Score` y `team2Score`: Si `status === 'completed'`, el ganador debe tener exactamente `Math.floor(bestOf / 2) + 1` victorias y el perdedor menos.

---

## 3. Inmutabilidad de Claves Primarias

En operaciones de actualización (`PUT /:resource`), el servicio verifica que ningún campo de clave primaria haya sido modificado (`crud-operations.service.ts:46-51`):

```typescript
for (const key of resource.keys) {
  if (mutation.values[key] !== undefined && mutation.values[key] !== mutation.key[key]) {
    throw new AppError(422, 'IMMUTABLE_KEY', `Cannot change primary key '${key}'.`);
  }
}
```

Si el administrador requiere cambiar la clave primaria de un registro (por ejemplo, el slug de un equipo), debe crear un registro nuevo y migrar o eliminar las referencias del anterior.

---

## 4. Matriz de Autorización y Privilegios por Rol

| Operación | Rol `viewer` | Rol `admin` | Rol `owner` | Justificación de Seguridad |
|---|:---:|:---:|:---:|---|
| `GET /resources` | ❌ 403 | ✅ 200 | ✅ 200 | Catálogo administrativo de recursos. |
| `GET /:resource` | ❌ 403 | ✅ 200 | ✅ 200 | Consulta de datos y referencias. |
| `POST /:resource` (Crear) | ❌ 403 | ✅ 201 | ✅ 201 | Creación de registros de competición. |
| `PUT /:resource` (Actualizar) | ❌ 403 | ✅ 200 | ✅ 200 | Edición con control de concurrencia optimista. |
| `POST /:resource/delete-preview` | ❌ 403 | ✅ 200 | ✅ 200 | Cálculo de impacto relacional y token SHA-256. |
| `DELETE /:resource` (Borrar) | ❌ 403 | ❌ 403 | ✅ 204 | **Solo `owner`**: el borrado relacional es destructivo e irreversible. |

### Restricciones y Autorización de Borrado
- Un usuario con rol `admin` puede visualizar qué datos dependen de una fila e inspeccionar el desglose de impacto en cascada.
- Sin embargo, si un usuario con rol `admin` pulsa el botón de borrado o envía una petición `DELETE`, la línea 112 de `postgres-crud-delete-plan.ts` arroja HTTP 403 `FORBIDDEN`:
  `Only an owner can delete related data.`
  Esta restricción previene la pérdida inadvertida de datos históricos por parte de administradores generales de la competición.
