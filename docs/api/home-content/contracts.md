# Contratos de Interfaz y Tipos Compartidos: Editorial Home Content

[⬅️ Volver a Validación](validation.md) | [Volver al Índice de API Home Content ⬆️](README.md)

---

## 1. Visión General de Contratos

Los contratos TypeScript que definen los modelos de datos, entradas de formulario y respuestas JSON para el contenido editorial y los quintetos ideales residen en el paquete compartido `@rcl/contracts` (`packages/contracts/src/home-content.ts:1-49`).

Estos contratos son compartidos estrictamente entre la API (`apps/api`) y la aplicación web (`apps/web`), garantizando que cualquier cambio en la estructura de los datos produzca errores de compilación estáticos en tiempo de construcción.

---

## 2. Definiciones de Tipos TypeScript (`packages/contracts/src/home-content.ts`)

```typescript
// packages/contracts/src/home-content.ts:1-49
export type EditorialKind = 'noticia' | 'reportaje' | 'entrevista' | 'otro';

export interface EditorialInput {
  title: string;
  excerpt: string;
  body: string;
  kind: EditorialKind;
  author: string;
  coverUrl: string;
  coverAlt: string;
  published: boolean;
  showOnHome: boolean;
  homeOrder: number;
}

export interface EditorialArticle extends EditorialInput {
  id: string;
  publishedAt: string | null;
  updatedAt: string;
}

export interface WeeklyPlayer {
  role: 'top' | 'jungle' | 'mid' | 'adc' | 'support';
  name: string;
  team: string;
  imageUrl: string;
  playerId?: string;
  teamId?: string;
  champions?: string[];
}

export interface WeeklyTeamInput {
  roundId: number;
  label: string;
  published: boolean;
  players: WeeklyPlayer[];
}

export interface WeeklyTeam extends Omit<WeeklyTeamInput, 'roundId'> {
  roundId: number | null;
  divisionId: string;
  updatedAt: string;
}

export interface WeeklyCandidate {
  playerId: string;
  teamId: string;
  memberId: string;
  name: string;
  team: string;
  tag: string | null;
  champions: string[];
  roles: WeeklyPlayer['role'][];
}
```

---

## 3. Desglose Detallado de Interfaces

### 3.1 `EditorialInput` y `EditorialArticle`

| Propiedad | Tipo | Obligatorio | Descripción |
|---|---|:---:|---|
| `id` | `string` (UUID) | Sí (solo en `EditorialArticle`) | Identificador único primario generado por la base de datos. |
| `title` | `string` | Sí | Titular del artículo (1 a 180 caracteres). |
| `excerpt` | `string` | Sí | Resumen o entradilla (hasta 500 caracteres, puede ser `""`). |
| `body` | `string` | Sí | Contenido completo en formato texto/markdown con imágenes inline. |
| `kind` | `EditorialKind` | Sí | Género editorial (`'noticia'`, `'reportaje'`, `'entrevista'`, `'otro'`). |
| `author` | `string` | Sí | Nombre o seudónimo del autor (1 a 120 caracteres). |
| `coverUrl` | `string` | Sí | URL interna (`/api/v1/home-content/images/...`) o externa HTTPS de la portada. |
| `coverAlt` | `string` | Sí | Texto alternativo descriptivo de la imagen de portada. Obligatorio si `coverUrl` está presente. |
| `published` | `boolean` | Sí | Estado de publicación (`true` = público, `false` = borrador). |
| `showOnHome` | `boolean` | Sí | Indica si se debe destacar en la página de inicio. |
| `homeOrder` | `number` (entero) | Sí | Prioridad de visualización en la home (0 = máxima prioridad). |
| `publishedAt` | `string \| null` (ISO 8601) | Sí (solo en `EditorialArticle`) | Fecha de la primera publicación. Nulo mientras sea borrador. |
| `updatedAt` | `string` (ISO 8601) | Sí (solo en `EditorialArticle`) | Fecha de la última modificación manual. |

---

### 3.2 `WeeklyTeamInput`, `WeeklyTeam` y `WeeklyPlayer`

| Propiedad | Tipo | Obligatorio | Descripción |
|---|---|:---:|---|
| `roundId` | `number \| null` | Sí | Número secuencial de jornada deportiva (1 a 32767). Nulo si no está asignado. |
| `divisionId` | `string` (UUID) | Sí (solo en `WeeklyTeam`) | Identificador de la división (`seasons_divisions.id`). |
| `label` | `string` | Sí | Título descriptivo (ej. `"Jornada 1 · Los Reyes de la Grieta"`). |
| `published` | `boolean` | Sí | Visibilidad pública del quinteto en la web. |
| `players` | `WeeklyPlayer[]` | Sí | Lista ordenada de exactamente 5 jugadores con roles únicos. |
| `updatedAt` | `string` (ISO 8601) | Sí (solo en `WeeklyTeam`) | Fecha de última actualización manual. |

#### Objeto `WeeklyPlayer`:
- `role`: Rol competitivo (`'top'`, `'jungle'`, `'mid'`, `'adc'`, `'support'`).
- `name`: Nombre de invocador oficial del jugador.
- `team`: Nombre del equipo en el que compitió en esa jornada.
- `imageUrl`: URL gráfica del jugador (forzado a `""` por el backend tras sanitización).
- `playerId`: Identificador UUID del jugador en la base de datos.
- `teamId`: Identificador UUID del equipo al que pertenecía durante la jornada.
- `champions`: Lista de nombres o identificadores de campeones seleccionados por el jugador durante la jornada.

---

### 3.3 `WeeklyCandidate`
Estructura devuelta por `GET /admin/weekly-teams/:id/candidates/:roundId` para alimentar los selectores de administración:
- `playerId`: UUID del jugador.
- `teamId`: UUID del equipo con el que disputó la jornada.
- `memberId`: UUID de la relación de membresía de plantilla (`team_memberships.id`).
- `name`: Nombre de invocador (`players.gameName`).
- `team`: Nombre del equipo (`teams.name`).
- `tag`: Acrónimo o etiqueta del equipo (`teams.tag`).
- `champions`: Conjunto de campeones jugados durante la jornada.
- `roles`: Conjunto de roles (`top`, `jungle`, etc.) en los que compitió el jugador en esa jornada.

---

## 4. Ejemplos de Cargas Útiles JSON

### 4.1 Creación de Artículo (`POST /api/v1/home-content/admin/articles`)

#### Solicitud:
```json
{
  "title": "Gran Final de División de Honor: Los Chicos coronan su reinado",
  "excerpt": "Tras cinco mapas agónicos, la serie se decidió en un dragón anciano memorable.",
  "body": "## El desenlace de una temporada histórica\n\nLa atmósfera en el servidor era eléctrica...\n\n![Momento del dragón anciano](/api/v1/home-content/images/6ba7b810-9dad-11d1-80b4-00c04fd430c8.png)\n\n> Ha sido la serie más difícil de mi carrera deportiva. — Comentó el capitán.",
  "kind": "cronica",
  "author": "Redacción RCL",
  "coverUrl": "/api/v1/home-content/images/6ba7b810-9dad-11d1-80b4-00c04fd430c9.jpg",
  "coverAlt": "Trofeo de campeones de Rebel Crown Legacy",
  "published": true,
  "showOnHome": true,
  "homeOrder": 0,
  "uploadedImages": [
    "/api/v1/home-content/images/6ba7b810-9dad-11d1-80b4-00c04fd430c8.png",
    "/api/v1/home-content/images/6ba7b810-9dad-11d1-80b4-00c04fd430c9.jpg"
  ]
}
```

#### Respuesta (HTTP 201):
```json
{
  "data": {
    "id": "c3d4e5f6-a7b8-4c1d-9e0f-1a2b3c4d5e6f",
    "title": "Gran Final de División de Honor: Los Chicos coronan su reinado",
    "excerpt": "Tras cinco mapas agónicos, la serie se decidió en un dragón anciano memorable.",
    "body": "## El desenlace de una temporada histórica...",
    "kind": "noticia",
    "author": "Redacción RCL",
    "coverUrl": "/api/v1/home-content/images/6ba7b810-9dad-11d1-80b4-00c04fd430c9.jpg",
    "coverAlt": "Trofeo de campeones de Rebel Crown Legacy",
    "published": true,
    "showOnHome": true,
    "homeOrder": 0,
    "publishedAt": "2026-09-30T21:00:00.000Z",
    "updatedAt": "2026-09-30T21:00:00.000Z"
  }
}
```
