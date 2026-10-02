# Contratos y DTOs Compartidos: CRUD Operations API

[⬅️ Volver a Validación](validation.md) | [Siguiente: README del Módulo ➡️](README.md)

---

## 1. Resumen de Contratos Compartidos

Los contratos del motor CRUD están centralizados en el paquete `@rcl/contracts` (`packages/contracts/src/crud-operations.ts:1-53`). Estos contratos definen la representación canónica de los recursos dinámicos, registros tabulares, resultados de paginación, mapas de partidos, reordenaciones de series y estructuras de previsualización de borrado relacional, siendo compartidos sin duplicación entre el backend (`apps/api`) y el frontend (`apps/web`).

---

## 2. Tipos Fundamentales y Estructura de Datos

### 2.1 Valores y Registros Dinámicos
```typescript
export type CrudValue = string | number | boolean | null;
export type CrudRecord = Record<string, CrudValue>;
```
- **Normalización de Tipos:** Los campos que internamente representan identificadores de 64 bits de Discord (`bigint` en PostgreSQL) se serializan forzosamente a cadenas de texto (`string`) en `postgres-crud-operations.repository.ts:47-56` para evitar pérdida de precisión numérica en el motor JavaScript del navegador.

---

### 2.2 Descriptor de Campos (`CrudField`)
```typescript
export interface CrudField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'url' | 'select';
  required?: boolean;
  immutable?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: string[];
  reference?: string;
  defaultValue?: CrudValue;
}
```
- **`type`:** Determina el control de entrada renderizado por `CrudRecordForm` en el cliente web.
- **`reference`:** Cuando está presente, indica que el campo es una clave foránea referenciando a otro recurso (ej. `teams`, `seasons`, `users`), activando la búsqueda interactiva de entidades relacionadas.
- **`immutable`:** Indica que el valor no puede modificarse tras la creación del registro.

---

### 2.3 Metadatos de Recurso (`CrudResource`)
```typescript
export interface CrudResource {
  name: string;
  label: string;
  description: string;
  keys: string[];
  fields: CrudField[];
}
```
- **`keys`:** Array con los nombres de las columnas que componen la clave primaria (admite claves compuestas como `['idSeason', 'idDivision']`).

---

### 2.4 Resultado de Paginación (`CrudPageResult`)
```typescript
export interface CrudPageResult {
  records: CrudRecord[];
  hasMore: boolean;
}
```
- Proporciona una ventana de lectura fija de 50 elementos con indicación booleana de páginas adicionales pendientes de cargar.

---

### 2.5 Contratos de Mapas y Reordenación de Series

Definidos en `packages/contracts/src/crud-operations.ts:3-13`:

#### A. Representación de Mapa en Panel de Administración (`AdminMatchMap`)
```typescript
export interface AdminMatchMap {
  id: string;
  gameNumber: number;
  externalGameId: string | null;
  durationSeconds: number | null;
  winner: string | null;
}
```
- **`id`:** Identificador único UUID del mapa en la tabla `match_games`.
- **`gameNumber`:** Posición ordinal asignada a la partida dentro del encuentro (1, 2, 3...).
- **`externalGameId`:** Identificador externo asignado por Riot Games o el sistema de ingesta (`null` en partidas manuales).
- **`durationSeconds`:** Duración real de la partida en segundos (`null` si no está disponible).
- **`winner`:** Nombre legible del equipo ganador (`schema.teams.name`), o `null` si no se ha registrado vencedor.

#### B. Ordenación Concurrente de Mapas (`MatchMapOrder`)
```typescript
export interface MatchMapOrder {
  expectedOrder: string[];
  gameIds: string[];
}
```
- **`expectedOrder`:** Secuencia de identificadores UUID de los mapas tal y como fueron leídos por el cliente en su última consulta. Actúa como token de concurrencia optimista; si la secuencia o cantidad de mapas en base de datos difiere al momento de guardar, la solicitud se rechaza con HTTP 409 `conflict('The maps have changed. Reload the order before saving.')`.
- **`gameIds`:** Secuencia ordenada deseada de identificadores UUID. Debe incluir todos los identificadores de los mapas del encuentro exactamente una vez.

---

## 3. Contratos de Previsualización y Borrado en Cascada

### 3.1 Impacto de Dependencia Relacional (`CrudDeleteImpact`)
```typescript
export interface CrudDeleteImpact {
  table: string;
  action: 'delete' | 'set-null' | 'blocked';
  count: number;
  examples: CrudRecord[];
}
```
- **`action`:**
  - `'delete'`: Registros que se eliminarán en cascada.
  - `'set-null'`: Columnas foráneas que se pondrán a `NULL`.
  - `'blocked'`: Restricciones que impiden el borrado.
- **`examples`:** Muestra representativa de hasta 3 registros para previsualización visual en el diálogo modal.

---

### 3.2 Previsualización de Borrado (`CrudDeletePreview`)
```typescript
export interface CrudDeletePreview {
  confirmation: string;
  allowed: boolean;
  impacts: CrudDeleteImpact[];
}
```
- **`confirmation`:** Token criptográfico SHA-256 de 64 caracteres generado sobre el estado del grafo relacional.
- **`allowed`:** Bandera booleana que habilita el botón de confirmación en la interfaz de usuario.

---

### 3.3 Dependencias Bloqueantes (`CrudDeleteDependency`)
```typescript
export interface CrudDeleteDependency {
  label: string;
  count: number;
}
```
- Utilizado por la excepción de cliente `CrudDependenciesError` para desglosar al usuario qué entidades impiden la eliminación directa de una fila.

---

## 4. Contratos Internos de Repositorio (`CrudMutation`)

Definido en `apps/api/src/modules/crud-operations/crud-operations.repository.ts:10-17`:

```typescript
export interface CrudMutation {
  action: 'create' | 'update' | 'delete';
  key: CrudRecord;
  values: CrudRecord;
  version?: string;
  actorId: string;
  cascadeConfirmation?: string;
}
```
- Encapsula de forma estricta los datos necesarios para ejecutar la mutación transaccional con verificación de versión optimista (`version`) y token de confirmación (`cascadeConfirmation`).

---

## 5. Especificación de Metadatos de Recursos y Campo `discordRoleId`

En `apps/api/src/modules/crud-operations/crud-operations.resources.ts:90-103`, el descriptor del recurso `teams` incorpora soporte para roles de Discord:

```typescript
{
  name: 'teams',
  label: 'Equipos',
  description: 'Equipos inscritos en cada competición y su identidad visual.',
  keys: ['id'],
  fields: [
    { name: 'seasonDivisionId', label: 'Competición', type: 'select', reference: 'competitions', required: true },
    { name: 'name', label: 'Nombre', type: 'text', maxLength: 120, required: true },
    { name: 'shortName', label: 'Abreviatura', type: 'text', maxLength: 16, required: false },
    { name: 'logoUrl', label: 'URL o ruta del escudo', type: 'text', maxLength: 2048, required: false },
    { name: 'color', label: 'Color (#RRGGBB)', type: 'text', maxLength: 7, required: false },
    { name: 'discordRoleId', label: 'ID del Rol de Discord', type: 'text', maxLength: 20, required: false },
    { name: 'isActive', label: 'Activo', type: 'boolean', required: true, defaultValue: true }
  ]
}
```

### Especificación del Campo `discordRoleId`
- **Tipo:** `text`.
- **Longitud Máxima:** `20` caracteres (correspondiente al límite superior de identificadores numéricos Snowflake de 64 bits en Discord).
- **Obligatoriedad:** Opcional / nullable (`required: false`, almacena `null` en base de datos si no se proporciona).
- **Propósito:** Almacena el Snowflake del rol de Discord representativo del equipo en el servidor de la liga. Facilita la asignación masiva de roles y las menciones automáticas en canales de competición.
