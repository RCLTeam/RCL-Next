# Tipos y Contratos de Interfaz: Editorial Home Content

[⬅️ Volver a Páginas](pages.md) | [Volver al Índice de Web Home Content ⬆️](README.md)

---

## 1. Visión General de Tipos en el Frontend

La capa frontend del módulo editorial define interfaces para la gestión de estados locales en formularios, la coordinación de pestañas de administración y la selección de jornadas, complementadas por las definiciones importadas desde el paquete de contratos `@rcl/contracts`.

---

## 2. Tipos Locales de Interfaz de Usuario

### 2.1 `EditorStateProps` (`apps/web/src/features/home-content/components/HomeContentPanel.tsx:52-56`)
Contrato estándar que deben satisfacer los paneles hijos administrados dentro de `HomeContentPanel`:

```typescript
// apps/web/src/features/home-content/components/HomeContentPanel.tsx:52-56
export interface EditorStateProps {
  dirty: boolean;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}
```

- `dirty`: Indica si el formulario activo contiene mutaciones o datos no guardados.
- `onDirty`: Notifica al contenedor principal cuando el usuario modifica o revierte un campo del formulario.
- `onBusy`: Notifica cuando se está ejecutando una llamada asíncrona a la API (subida de imagen, persistencia o eliminación), inhabilitando las acciones de cambio de pestaña.

---

### 2.2 `WeeklySelection` (`apps/web/src/site/pages/home/components/WeeklyTeam/TeamOfTheWeekStrip.tsx:14`)
Estructura que representa la jornada seleccionada por el usuario en la tira del quinteto ideal:

```typescript
interface WeeklySelection {
  divisionId: string;
  roundId: number;
}
```

---

## 3. Reexportaciones y Tipos Importados de `@rcl/contracts`

Los componentes y hooks de la interfaz consumen directamente los contratos compartidos:

| Tipo | Origen | Uso en Frontend |
|---|---|---|
| `EditorialArticle` | `@rcl/contracts` | Modelo completo de artículo con `id`, `publishedAt` y `updatedAt`. Utilizado en `ArticleView`, `EditorialGrid`, `EditorialPage` y `EditorialManager`. |
| `EditorialInput` | `@rcl/contracts` | Estructura base de datos editables de artículo. Utilizada como estado de formulario en `EditorialManager`. |
| `WeeklyTeam` | `@rcl/contracts` | Quinteto ideal recuperado de la API. Utilizado en `TeamOfTheWeekStrip` y `WeeklyTeamManager`. |
| `WeeklyTeamInput` | `@rcl/contracts` | Carga útil para crear o actualizar un quinteto en `WeeklyRoundEditor`. |
| `WeeklyPlayer` | `@rcl/contracts` | Representación de cada uno de los 5 jugadores del quinteto (`role`, `name`, `team`, `champions`). |
| `WeeklyCandidate` | `@rcl/contracts` | Candidatos devueltos por la API para alimentar los desplegables de selección en `WeeklyRoundEditor`. |
