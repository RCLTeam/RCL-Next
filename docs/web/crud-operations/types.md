# Tipos y Contratos de Interfaz: Web CRUD Operations

[⬅️ Volver a Páginas](pages.md) | [Siguiente: README de la Feature ➡️](README.md)

---

## 1. Ubicación de Contratos y Ausencia de Carpeta `types/`

Al auditar la estructura de tipos de `apps/web/src/features/crud-operations/`:

> **Ubicación de Contratos:**
> La feature web de operaciones CRUD **no** posee una subcarpeta física `types/` local.
> En su lugar, todos los contratos de dominio, descriptores de esquemas y tipos DTO se importan directamente desde el paquete monorepo compartido `@rcl/contracts` (`packages/contracts/src/crud-operations.ts`), mientras que los estados de control de interfaz se tipan mediante uniones discriminadas e interfaces locales en cada componente y en el cliente de transporte.

---

## 2. Tipos Reexportados desde `@rcl/contracts`

Los componentes visuales y el cliente de API importan desde `@rcl/contracts` los siguientes modelos:

```typescript
import type {
  CrudValue,
  CrudRecord,
  CrudField,
  CrudResource,
  CrudPageResult,
  CrudDeleteImpact,
  CrudDeletePreview,
  CrudDeleteDependency
} from '@rcl/contracts';
```

- **`CrudRecord`:** `Record<string, string | number | boolean | null>`, estructura base de cada fila renderizada.
- **`CrudResource`:** Metadatos de la tabla activa, incluyendo `keys: string[]` y `fields: CrudField[]`.
- **`CrudDeletePreview`:** Estructura que transporta el token criptográfico `confirmation`, la bandera de viabilidad `allowed` y la lista de `impacts: CrudDeleteImpact[]`.

---

## 3. Tipos y Modelos de Estado de Interfaz (UI State)

### 3.1 Estado del Editor de Registros (`editor`)
Definido en `CrudDataPanel.tsx:25`:
```typescript
type EditorState = { record: CrudRecord | null } | null;
```
- `null`: El formulario modal o panel de edición permanece cerrado.
- `{ record: null }`: Modo creación (formulario en blanco).
- `{ record: CrudRecord }`: Modo edición (formulario poblado con los valores del registro seleccionado).

### 3.2 Estado de Borrado (`deleting`)
Definido en `CrudDataPanel.tsx:26`:
```typescript
type DeletingState = CrudRecord | null;
```
- Cuando contiene un objeto `CrudRecord`, desencadena el montaje y apertura del diálogo `<CrudDeleteDialog>`.

---

## 4. Clases de Error Tipadas del Cliente (`CrudDependenciesError`)

Definida en `apps/web/src/features/crud-operations/api/crud-operations-api.ts:9-15`:

```typescript
export class CrudDependenciesError extends Error {
  constructor(public readonly dependencies: CrudDeleteDependency[]) {
    super(
      'Existen entidades relacionadas que impiden esta operación. Elimina o reasigna esas referencias antes de intentarlo de nuevo.'
    );
  }
}
```
- Permite capturar de forma tipada las respuestas de conflicto HTTP 409 `RELATED_RECORDS`, permitiendo a los componentes renderizar la lista de dependencias bloqueantes (`dependencies: [{ label, count }]`) sin necesidad de parsear cadenas de texto no estructuradas.
