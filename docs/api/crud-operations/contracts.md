# Contratos y DTOs Compartidos: CRUD Operations API

[⬅️ Volver a Validación](validation.md) | [Siguiente: README del Módulo ➡️](README.md)

---

## 1. Resumen de Contratos Compartidos

Los contratos del motor CRUD están centralizados en el paquete `@rcl/contracts` (`packages/contracts/src/crud-operations.ts:1-42`). Estos contratos definen la representación canónica de los recursos dinámicos, registros tabulares, resultados de paginación y estructuras de previsualización de borrado relacional, siendo compartidos sin duplicación entre el backend (`apps/api`) y el frontend (`apps/web`).

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

Definido en `apps/api/src/modules/crud-operations/crud-operations.repository.ts:3-12`:

```typescript
export interface CrudMutation {
  resource: string;
  action: 'create' | 'update' | 'delete';
  key: CrudRecord;
  version?: string;
  values?: CrudRecord;
  cascadeConfirmation?: string;
  actorId: string;
}
```
- Encapsula de forma estricta los datos necesarios para ejecutar la mutación transaccional con verificación de versión optimista (`version`) y token de confirmación (`cascadeConfirmation`).
