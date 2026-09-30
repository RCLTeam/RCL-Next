# Tipos y Contratos de Interfaz: Web Database Transfer

[⬅️ Volver a Páginas](pages.md) | [Siguiente: README de la Feature ➡️](README.md)

---

## 1. Ubicación de Contratos y Ausencia de Carpeta `types/`

Al examinar los tipos de datos en `apps/web/src/features/database-transfer/`:

> **Ubicación de Contratos:**
> La feature web de transferencias de base de datos **no** cuenta con una subcarpeta física `types/` local.
> En su lugar, la totalidad de los modelos de datos y contratos DTO se importan directamente desde `@rcl/contracts` (`packages/contracts/src/database-transfer.ts`), mientras que los estados de control de interfaz se gestionan con tipos locales en el componente de panel.

---

## 2. Tipos Reexportados desde `@rcl/contracts`

Los componentes visuales y el cliente de transporte consumen desde `@rcl/contracts`:

```typescript
import type {
  DatabaseImportTable,
  DatabaseImportPreview,
  DatabaseImportResult
} from '@rcl/contracts';
```

- **`DatabaseImportTable`:** Métrica tabular con `{ table: string, currentRows: number, importedRows: number }`.
- **`DatabaseImportPreview`:** Estructura con `{ confirmation: string, exportedAt: string | null, tables: DatabaseImportTable[] }`.
- **`DatabaseImportResult`:** Objeto de éxito con `{ importedAt: string }`.

---

## 3. Tipos y Modelos de Estado de Interfaz (UI State)

### 3.1 Variables de Estado del Panel (`DatabaseTransferPanel.tsx:15-21`)
- **`file` (`File | null`):** Archivo binario `.dump` seleccionado por el usuario en el `<input type="file">`.
- **`preview` (`DatabaseImportPreview | null`):** Resultado devuelto por la simulación previa en el servidor; al tener valor, dispara la apertura del modal `<Modal>`.
- **`busy` (`string`):** Etiqueta de la operación asíncrona activa (ej. `'Descargando...'`, `'Validando...'`, `'Importando...'`). Si es una cadena no vacía, bloquea las acciones concurrentes.
- **`error` (`string`):** Mensaje descriptivo de error capturado tras una excepción en la API.
- **`notice` (`string`):** Mensaje de notificación informativa para operaciones exitosas.
- **`completed` (`boolean`):** Bandera que conmuta el panel a la vista final accesible de sesión cerrada.
- **`confirmation` (`string`):** Cadena tecleada por el usuario en el modal para desbloquear la importación (debe coincidir exactamente con `'IMPORTAR'`).

---

## 4. Diccionario de Errores Tipados de Transporte

Definido en `apps/web/src/features/database-transfer/api/database-transfer-api.ts:12-22`:

```typescript
const messages: Record<string, string> = {
  IMPORT_PREVIEW_CHANGED:
    'El archivo o la base de datos han cambiado. Vuelve a validar antes de importar.',
  DATABASE_BUSY:
    'Hay otra operación en curso. Inténtalo de nuevo en unos instantes.',
  POSTGRES_TOOLS_UNAVAILABLE:
    'No están disponibles pg_dump y pg_restore. Revisa POSTGRES_BIN_DIR en la API.',
  INCOMPATIBLE_BACKUP:
    'El backup no corresponde al esquema actual de RCL o está incompleto.',
  INVALID_BACKUP:
    'Selecciona un backup PostgreSQL válido en formato .dump.',
  INVALID_BACKUP_DATA:
    'El backup contiene datos incompatibles. La base actual se ha conservado.'
};
```
- Mapea códigos de error semánticos devueltos por la API en formato JSON hacia mensajes legibles en castellano presentados en la interfaz de usuario.
