# Contratos de Interfaz, DTOs y Catálogo de Errores: Team Logos

[⬅️ Volver a Persistencia](persistence.md) | [Volver al Índice de Team Logos ⬆️](README.md)

---

## 1. Contratos de Datos y DTOs

Las estructuras de datos intercambiadas por los servicios de logos de equipos se ajustan a las convenciones estándar de envolturas JSON (`{ data: ... }` y `{ error: ... }`) de RCL-Next.

### 1.1 Estructura del Objeto Logo (`TeamLogoEntry`)
Representa una insignia registrada en el sistema de almacenamiento del servidor:

```typescript
export interface TeamLogoEntry {
  /** Nombre del archivo físico incluyendo su extensión autorizada (ej. 'AKL.webp', 'KOI.png'). */
  name: string;
  /** Ruta canónica relativa para la consulta y renderizado público de la imagen. */
  url: string;
}
```

### 1.2 Envolturas de Respuesta Exitosa

- **Listado de Logos (`GET /api/v1/team-logos/admin`):**
  ```json
  {
    "data": [
      {
        "name": "AKL.webp",
        "url": "/api/v1/team-logos/images/AKL.webp"
      },
      {
        "name": "KOI.png",
        "url": "/api/v1/team-logos/images/KOI.png"
      },
      {
        "name": "placeholder.webp",
        "url": "/api/v1/team-logos/images/placeholder.webp"
      }
    ]
  }
  ```

- **Creación / Subida de Logo (`POST /api/v1/team-logos/admin/:name`):**
  ```json
  {
    "data": {
      "name": "equipo-ejemplo.webp",
      "url": "/api/v1/team-logos/images/equipo-ejemplo.webp"
    }
  }
  ```

- **Eliminación de Logo (`DELETE /api/v1/team-logos/admin/:name`):**
  ```json
  {
    "data": null
  }
  ```

---

## 2. Contratos de Transporte y Protocolo de Cliente

### 2.1 Protocolo de Carga Binaria (HTTP Raw)
A diferencia de endpoints convencionales que requieren empaquetado `multipart/form-data`, la subida de logos se realiza mediante un flujo binario directo:

- **Método:** `POST`
- **Ruta:** `/api/v1/team-logos/admin/:name` (donde `:name` es codificado mediante `encodeURIComponent`)
- **Cabeceras Obligatorias:**
  - `Content-Type`: Tipo MIME coincidente con el archivo (`image/png`, `image/jpeg` o `image/webp`).
  - `Origin`: Origen autorizado del frontend (`auth.frontendOrigin`).
  - `Cookie`: Cookie de sesión autenticada (`rcl_session` o `__Host-rcl_session`).
- **Cuerpo HTTP:** Flujo binario crudo del archivo de hasta 5 MiB (5.242.880 bytes).

### 2.2 Implementación del Cliente en Frontend (`teamLogosApi`)
El cliente oficial de la aplicación web se localiza en `apps/web/src/features/team-logos/api/team-logos-api.ts:1-35`:

```typescript
// apps/web/src/features/team-logos/api/team-logos-api.ts:1-34
export type Logo = { name: string; url: string };

async function logoRequest<T>(path = '', init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/team-logos/admin${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Inicia sesión de nuevo.',
      403: 'No tienes permisos para gestionar logos.',
      404: 'El logo ya no existe. Actualiza la lista.',
      409: 'Ya existe un logo con ese nombre.',
      413: 'La imagen supera los 5 MB.',
      422: 'Usa una imagen PNG, JPEG o WebP y un nombre con letras, números o guiones.'
    };
    throw new Error(
      messages[response.status] ?? 'No se pudo completar la operación. Inténtalo de nuevo.'
    );
  }
  return (await response.json()).data as T;
}

export const teamLogosApi = {
  list: () => logoRequest<Logo[]>(),
  upload: (file: File) =>
    logoRequest<Logo>(`/${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file
    }),
  remove: (name: string) =>
    logoRequest<null>(`/${encodeURIComponent(name)}`, { method: 'DELETE' })
};
```

---

## 3. Catálogo Exhaustivo de Códigos de Error

Todos los errores generados por el módulo siguen la estructura tipada de `AppError` (`apps/api/src/shared/app-error.ts:1-21`) serializada por el manejador global `errorHandler` (`apps/api/src/shared/http.ts:5-38`):

```json
{
  "error": {
    "code": "STRING_ERROR_CODE",
    "message": "Mensaje legible del error."
  }
}
```

### Matriz Completa de Códigos de Error

| HTTP Status | Código de Error (`code`) | Mensaje Emitido / Descripción | Origen / Condición de Activación | Referencia en Código |
|:---:|---|---|---|---|
| **400** | `INVALID_JSON` | `Invalid request body.` | Cuerpo de petición malformado en middlewares de parsing. | `http.ts:24-30` |
| **401** | `UNAUTHORIZED` | *Mensaje de autenticación* | Petición a ruta administrativa sin cookie de sesión o con sesión inválida/expirada. | `auth.router.ts:15-17` |
| **403** | `FORBIDDEN` | `Insufficient permissions.` | Usuario autenticado cuyo rol no es `admin` ni `owner` (ej. rol `viewer`). | `auth.router.ts:18-19` |
| **403** | `INVALID_ORIGIN` | `Request origin is not allowed.` | Cabecera `Origin` ausente o no coincidente con `auth.frontendOrigin`. | `auth.router.ts:28-30` |
| **403** | `PROTECTED_LOGO` | `El logo de reserva está protegido y no se puede modificar ni eliminar.` | Intento de sobrescribir o eliminar `placeholder.webp` (evaluado de forma insensible a mayúsculas). | `team-logos.store.ts:83-88` |
| **404** | `NOT_FOUND` | `Logo was not found.` | El archivo solicitado no existe (`ENOENT`), es un directorio o constituye un enlace simbólico (`isSymbolicLink()`). | `team-logos.store.ts:25-28` |
| **409** | `LOGO_EXISTS` | `Ya existe un logo con ese nombre.` | Colisión atómica al escribir con bandera `wx`; el archivo ya existe en disco (`EEXIST`). | `team-logos.store.ts:70-71` |
| **413** | `PAYLOAD_TOO_LARGE` | `Invalid request body.` | Carga binaria entrante superior a 5 MiB (5.242.880 bytes) interceptada por el parser de Express. | `team-logos.router.ts:30`<br>`http.ts:24-30` |
| **422** | `INVALID_LOGO_NAME` | `Usa un nombre con letras, números, guiones y extensión PNG, JPEG o WebP.` | El parámetro `:name` no cumple con la expresión regular `/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}\.(png|jpe?g|webp)$/`. | `team-logos.store.ts:13-18` |
| **422** | `INVALID_IMAGE` | `Selecciona una imagen de hasta 5 MB.` | El cuerpo recibido no es un búfer binario, está vacío o supera 5 MiB. | `team-logos.store.ts:47-48` |
| **422** | `INVALID_IMAGE` | `El contenido y la extensión deben corresponder a una imagen PNG, JPEG o WebP.` | Discrepancia entre la extensión del archivo, la cabecera `Content-Type` y los *magic bytes* binarios. | `team-logos.store.ts:60-65` |
| **503** | — | `La autenticación no está configurada.` | Se accede a rutas administrativas cuando la API ha arrancado sin el servicio de autenticación configurado (`!auth`). | `team-logos.router.ts:19-24` |

---

## 4. Normalización y Resolución de Rutas en Clientes Web

Para mantener la compatibilidad con registros históricos de base de datos que almacenaban rutas estáticas locales, la aplicación web incluye un mecanismo de resolución y saneamiento en `apps/web/src/shared/resources/team-logos.ts:1-23`:

```typescript
// apps/web/src/shared/resources/team-logos.ts:1-22
import { safeStreamUrl } from '../../features/competition/api/competition-api.js';

export const teamLogoDirectory = '/api/v1/team-logos/images/';
const publicTeamLogoDirectory = '/images/teams_logo/';
const legacyTeamLogoDirectory = '/src/shared/assets/teams_logo/';

// Existing database records can still contain the former asset location.
export function normalizeTeamLogoPath(path: string): string {
  const directory = [legacyTeamLogoDirectory, publicTeamLogoDirectory].find((prefix) =>
    path.startsWith(prefix)
  );
  return directory ? `${teamLogoDirectory}${path.slice(directory.length)}` : path;
}

export function resolveTeamLogo(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const path = value.trim();
  if (/^\/(?!\/)/.test(path) && !/[\\\s]/.test(path)) {
    return normalizeTeamLogoPath(path);
  }
  return safeStreamUrl(path);
}
```

### Reglas de Transformación
1. **Rutas Históricas:** Rutas con prefijo `/src/shared/assets/teams_logo/AKL.webp` o `/images/teams_logo/AKL.webp` son reescritas automáticamente a `/api/v1/team-logos/images/AKL.webp`.
2. **Rutas Absolutas Seguras:** Rutas locales que comienzan con `/` (y no `//`, barras invertidas o espacios) son saneadas y normalizadas.
3. **URLs Externas Seguras (`safeStreamUrl`):** Rutas externas (`https://ejemplo.com/logo.webp`) se preservan únicamente si su protocolo es `https:` o `http:` apuntando a `localhost` o `127.0.0.1` (`apps/web/src/features/competition/api/competition-api.ts:11-26`). Esquemas inseguros como `javascript:`, `data:` o `file:` son descartados y convertidos a `undefined`.

### Fallback Visual en Componentes (`TeamBadge.tsx`)
En la capa de presentación visual (`apps/web/src/features/competition/components/TeamBadge.tsx:12, 38`), si `resolveTeamLogo` devuelve `undefined` o si el evento `onError` del elemento `<img>` se dispara (por ejemplo, ante un error 404 del servidor), el componente sustituye automáticamente la fuente por el logo de reserva:

```typescript
// apps/web/src/features/competition/components/TeamBadge.tsx:12
const DEFAULT_LOGO_URL = '/api/v1/team-logos/images/placeholder.webp';
```
Esto asegura que la interfaz de usuario nunca muestre imágenes rotas.
