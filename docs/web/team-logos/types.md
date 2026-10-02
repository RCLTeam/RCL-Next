# Tipos, Contratos y Modelo de Datos: Team Logos Frontend

[⬅️ Volver a Componentes UI](components.md) | [Volver al Índice del Módulo ➡️](README.md)

---

## 1. Resumen Ejecutivo

El módulo de gestión de logos de equipos en el cliente web (`apps/web/src/features/team-logos/`) opera bajo contratos de tipos estrictos en TypeScript que garantizan la integridad de las cargas útiles de imagen, el estado reactivo de la interfaz de usuario, la traducción contextual de errores del servidor y la normalización transparente de rutas de almacenamiento de recursos gráficos.

La arquitectura de tipos desacopla la comunicación HTTP mediante un cliente tipado específico (`teamLogosApi`), expone una máquina de estados determinista a través del gancho `useTeamLogos` y unifica la resolución de identificadores gráficos mediante funciones puras compartidas en `apps/web/src/shared/resources/team-logos.ts`.

---

## 2. Entidades de Dominio

### Modelo `Logo`

El tipo fundamental que representa una insignia de equipo registrada en la plataforma está definido en `apps/web/src/features/team-logos/api/team-logos-api.ts:1`:

```typescript
// apps/web/src/features/team-logos/api/team-logos-api.ts:1
export type Logo = {
  name: string;
  url: string;
};
```

| Propiedad | Tipo | Descripción | Ejemplo de Valor |
|---|---|---|---|
| `name` | `string` | Nombre canónico del archivo de imagen con su extensión válida (`.png`, `.jpg`, `.jpeg`, `.webp`). Actúa como identificador unívoco de la entidad en las rutas administrativas. | `"FNX.webp"`, `"K020.png"` |
| `url` | `string` | Ruta absoluta accesible en el servidor HTTP para servir o precargar el recurso visual. Generada por la API backend combinando el prefijo `/api/v1/team-logos/images/` con el nombre del archivo. | `"/api/v1/team-logos/images/FNX.webp"` |

---

## 3. Contratos del Cliente API (`teamLogosApi`)

El objeto `teamLogosApi` (`apps/web/src/features/team-logos/api/team-logos-api.ts:25-34`) implementa la interfaz de acceso a la superficie administrativa REST bajo `/api/v1/team-logos/admin`.

```typescript
// apps/web/src/features/team-logos/api/team-logos-api.ts:25-34
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

### Especificación de Operaciones

| Método | Firma | Endpoint HTTP | Cabeceras | Cuerpo de la Petición | Retorno |
|---|---|---|---|---|---|
| `list()` | `() => Promise<Logo[]>` | `GET /api/v1/team-logos/admin` | N/A | Ninguno | `Promise<Logo[]>` |
| `upload(file)` | `(file: File) => Promise<Logo>` | `POST /api/v1/team-logos/admin/:name` | `Content-Type: file.type` | Binario crudo (`File`) | `Promise<Logo>` |
| `remove(name)` | `(name: string) => Promise<null>` | `DELETE /api/v1/team-logos/admin/:name` | N/A | Ninguno | `Promise<null>` |

### Función de Transporte `logoRequest<T>`

La función interna `logoRequest<T>` (`apps/web/src/features/team-logos/api/team-logos-api.ts:3-23`) estandariza el transporte de red:

```typescript
// apps/web/src/features/team-logos/api/team-logos-api.ts:3-23
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
```

- **Inclusión de Credenciales:** Configura `credentials: 'include'` (`línea 5`) para propagar automáticamente la cookie de sesión de Discord en todas las transacciones administrativas.
- **Inhabilitación de Caché:** Especifica `cache: 'no-store'` (`línea 6`) para evitar que el navegador reutilice respuestas obsoletas en operaciones de mutación o refresco de catálogo.
- **Desempaquetado del Sobre JSON:** El backend devuelve las entidades envueltas en `{ data: T }`. La función extrae y retorna directamente `(await response.json()).data as T` (`línea 22`).

---

## 4. Diccionario de Errores y Mapeo de Códigos HTTP

Cuando una petición no resulta exitosa (`!response.ok`), `logoRequest` intercepta el código de estado HTTP y genera una excepción tipada con un mensaje descriptivo en lenguaje natural (`apps/web/src/features/team-logos/api/team-logos-api.ts:10-20`):

| Código HTTP | Causa en el Servidor | Mensaje al Usuario en la Interfaz |
|:---:|---|---|
| `401 Unauthorized` | Sesión caducada o ausencia de cabecera/cookie de autorización. | `"Inicia sesión de nuevo."` |
| `403 Forbidden` | El usuario autenticado carece del rol `admin` u `owner`, o intentó alterar `placeholder.webp`. | `"No tienes permisos para gestionar logos."` |
| `404 Not Found` | El recurso solicitado no existe en el disco o corresponde a un enlace simbólico. | `"El logo ya no existe. Actualiza la lista."` |
| `409 Conflict` | Existe un archivo con el mismo identificador (`flag: 'wx'` en el sistema de archivos). | `"Ya existe un logo con ese nombre."` |
| `413 Payload Too Large` | La carga útil del archivo supera el límite físico de 5 MiB (5.242.880 bytes). | `"La imagen supera los 5 MB."` |
| `422 Unprocessable Entity` | Nombre con caracteres prohibidos o contenido binario que no coincide con los *magic bytes*. | `"Usa una imagen PNG, JPEG o WebP y un nombre con letras, números o guiones."` |
| `Otro (500, 502, etc.)` | Falla interna no clasificada del servidor o interrupción de red. | `"No se pudo completar la operación. Inténtalo de nuevo."` |

---

## 5. Contrato de Estado del Hook Reactivo (`useTeamLogos`)

El gancho `useTeamLogos` (`apps/web/src/features/team-logos/hooks/useTeamLogos.ts:4-97`) expone un contrato unificado para gobernar el estado de la vista y despachar mutaciones:

```typescript
// apps/web/src/features/team-logos/hooks/useTeamLogos.ts:82-97
export interface UseTeamLogosReturn {
  logos: Logo[];
  loading: boolean;
  busy: boolean;
  error: string;
  message: string;
  file: File | null;
  setFile: (file: File | null) => void;
  pendingDelete: Logo | null;
  setPendingDelete: (logo: Logo | null) => void;
  inputKey: number;
  upload: () => Promise<void>;
  refresh: () => Promise<void>;
  confirmDelete: () => Promise<void>;
  copyUrl: (logo: Logo) => Promise<void>;
}
```

### Especificación de Propiedades y Acciones

| Miembro | Tipo | Descripción |
|---|---|---|
| `logos` | `Logo[]` | Colección ordenada alfabéticamente por `name` de todos los logos registrados. |
| `loading` | `boolean` | `true` durante la carga inicial del catálogo al montar el componente; `false` tras la respuesta. |
| `busy` | `boolean` | `true` durante la ejecución de cualquier mutación asíncrona (`upload`, `refresh`, `confirmDelete`, `copyUrl`). Deshabilita los controles de la interfaz. |
| `error` | `string` | Mensaje de error formateado para su presentación en `<p role="alert">`. Se vacía al iniciar una nueva acción. |
| `message` | `string` | Mensaje informativo o de éxito (p. ej. `"Logo FNX.webp subido."`, `"Ruta copiada."`). Presentado en `<output>`. |
| `file` | `File \| null` | Archivo binario seleccionado en el control `<input type="file">` listo para ser subido. |
| `setFile` | `(file: File \| null) => void` | Modificador para actualizar el archivo seleccionado en respuesta a eventos `change`. |
| `pendingDelete` | `Logo \| null` | Entidad `Logo` marcada para su eliminación. Si es distinto de `null`, activa el diálogo de confirmación. |
| `setPendingDelete` | `(logo: Logo \| null) => void` | Modificador para seleccionar la entidad a borrar o cancelar el diálogo (`null`). |
| `inputKey` | `number` | Contador incremental que fuerza la recreación del elemento DOM `<input type="file">`, reseteando la selección nativa tras una subida exitosa. |
| `upload` | `() => Promise<void>` | Ejecuta validaciones locales (< 5 MB, no placeholder) y despacha la subida a la API. |
| `refresh` | `() => Promise<void>` | Solicita a la API una lista actualizada de logos y refresca la colección en memoria. |
| `confirmDelete` | `() => Promise<void>` | Despacha la petición `DELETE` para `pendingDelete.name` y remueve el elemento de `logos`. |
| `copyUrl` | `(logo: Logo) => Promise<void>` | Escribe `logo.url` en el portapapeles mediante `navigator.clipboard.writeText`. |

---

## 6. Contratos del Resolutor y Normalizador de Rutas

El módulo compartido `apps/web/src/shared/resources/team-logos.ts:1-22` declara las firmas para la resolución de rutas de logos tanto locales como históricas y remotas:

```typescript
// apps/web/src/shared/resources/team-logos.ts:3-5
export const teamLogoDirectory = '/api/v1/team-logos/images/';
const publicTeamLogoDirectory = '/images/teams_logo/';
const legacyTeamLogoDirectory = '/src/shared/assets/teams_logo/';
```

### Firmas de Funciones

```typescript
// apps/web/src/shared/resources/team-logos.ts:8
export function normalizeTeamLogoPath(path: string): string;

// apps/web/src/shared/resources/team-logos.ts:15
export function resolveTeamLogo(value: string | null | undefined): string | undefined;
```

### Matriz de Comportamiento del Resolutor

Comportamiento verificado en la suite unitaria `tests/unit/team-logos.test.ts:4-15`:

| Entrada (`value`) | Resultado (`resolveTeamLogo`) | Regla Aplicada |
|---|---|---|
| `"/src/shared/assets/teams_logo/AKL.webp"` | `"/api/v1/team-logos/images/AKL.webp"` | Detección de prefijo heredado de desarrollo; reemplazo por `teamLogoDirectory`. |
| `"/images/teams_logo/AKL.webp"` | `"/api/v1/team-logos/images/AKL.webp"` | Detección de prefijo público previo de Vite; reemplazo por `teamLogoDirectory`. |
| `"/api/v1/team-logos/images/FNX.webp"` | `"/api/v1/team-logos/images/FNX.webp"` | Ruta canónica actual; conservada sin alteraciones. |
| `"https://example.com/logo.webp"` | `"https://example.com/logo.webp"` | URL absoluta HTTP/HTTPS; validada por `safeStreamUrl`. |
| `"javascript:alert(1)"` | `undefined` | Esquema peligroso rechazado por `safeStreamUrl`. |
| `null` o `undefined` | `undefined` | Guardia de valor nulo (`!value`). |

---

## 7. Contratos de Enrutamiento Administrativo

En `apps/web/src/site/routes.tsx:147-155`, el catálogo de rutas administrativas incluye la definición formal del panel:

```typescript
// apps/web/src/site/routes.tsx:153
{ path: '/admin/team-logos', title: 'Team Logos' }
```

Al resolverse mediante `resolveSiteRoute(path)` (`apps/web/src/site/routes.tsx:162-189`):
- `id`: `'admin'`
- `title`: `'Team Logos · Admin'` (`apps/web/src/site/routes.tsx:183`)
- `navigationPath`: `'/admin'`
- `competition`: `false`
- `parameter`: `''`
- `render`: `({ wsUrl }) => <AdminPage path="/admin/team-logos" wsUrl={wsUrl} />` (`apps/web/src/site/routes.tsx:187`)
