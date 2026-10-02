# Contratos y DTOs Compartidos: Database Transfer API

[⬅️ Volver a Validación](validation.md) | [Siguiente: README del Módulo ➡️](README.md)

---

## 1. Resumen de Contratos Compartidos

Los contratos de transferencia de base de datos se encuentran centralizados en el paquete `@rcl/contracts` (`packages/contracts/src/database-transfer.ts:1-14`). Definen las estructuras de datos devueltas por la simulación previa y la confirmación de restauración, permitiendo al cliente web renderizar desgloses de impacto tabulares antes de autorizar la mutación.

---

## 2. Tipos y DTOs Exportados

### 2.1 Métrica por Tabla Relacional (`DatabaseImportTable`)
```typescript
export interface DatabaseImportTable {
  table: string;
  currentRows: number;
  importedRows: number;
}
```
- **`table`:** Nombre físico de la tabla relacional en PostgreSQL (ej. `seasons`, `discord_users`, `matches`).
- **`currentRows`:** Número de registros actualmente presentes en la base de datos viva.
- **`importedRows`:** Número de registros presentes en el volcado que se restaurarán.

---

### 2.2 Previsualización de Importación (`DatabaseImportPreview`)
```typescript
export interface DatabaseImportPreview {
  confirmation: string;
  exportedAt: string | null;
  tables: DatabaseImportTable[];
}
```
- **`confirmation`:** Token criptográfico SHA-256 de 64 caracteres generado durante la simulación transaccional con `SAVEPOINT`. Debe enviarse obligatoriamente en la cabecera `X-Import-Confirmation` al confirmar la importación definitiva.
- **`exportedAt`:** Marca de tiempo ISO-8601 en la que se generó originalmente el volcado (o `null` si no está disponible en los metadatos de PostgreSQL).
- **`tables`:** Matriz con el desglose de conteos de filas para cada una de las 21 tablas relacionales del esquema.

---

### 2.3 Resultado de Restauración Exitosa (`DatabaseImportResult`)
```typescript
export interface DatabaseImportResult {
  importedAt: string;
}
```
- **`importedAt`:** Marca de tiempo ISO-8601 que certifica el instante exacto en que concluyó la transacción de restauración física.

---

## 3. Parámetros de Configuración y Constantes de Transporte

- **`MAX_DATABASE_BACKUP_BYTES`:** `67_108_864` bytes (64 MiB).
- **MIME Type de Volcado:** `application/octet-stream`.
- **Formato Canónico de Archivo Adjunto:** `rcl-YYYY-MM-DDTHH-MM-SS.sssZ.dump`.
- **Cabecera HTTP de Confirmación:** `X-Import-Confirmation`.
