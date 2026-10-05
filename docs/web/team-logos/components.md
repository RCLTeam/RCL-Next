# Componentes y Arquitectura de Interfaz: Team Logos

[⬅️ Volver al Índice del Módulo](README.md) | [Siguiente: Tipos y Contratos ➡️](types.md)

---

## 1. Resumen Ejecutivo

El subsistema de interfaz de usuario para la administración y visualización de insignias de equipos (`apps/web/src/features/team-logos/`) sigue la arquitectura desacoplada del monorepo (Golden Standard). La lógica de red y estado se separa completamente de la presentación visual:

1. **Panel Presentacional (*Dumb UI*):** `TeamLogosPanel.tsx` delega el estado asíncrono y los efectos en el gancho dedicado, encargándose exclusivamente de renderizar controles accesibles, formularios y cuadrículas visuales.
2. **Gancho Desacoplado (*Headless Hook*):** `useTeamLogos.ts` gestiona las mutaciones con la API, las validaciones preventivas en cliente, la ordenación alfabética y la reactividad.
3. **Insignia Resiliente con Fallback Multinivel:** `TeamBadge.tsx` proporciona una estrategia de degradación elegante ante errores de red o imágenes ausentes, transitando de la imagen del equipo al logo de reserva (`placeholder.webp`) y, en última instancia, a las iniciales textuales del equipo.
4. **Integración Administrativa y Rutas:** `AdminPage.tsx` y `routes.tsx` protegen el panel bajo barreras de rol (`admin`, `owner`) con enlace directo en la navegación de administración.

---

## 2. Panel de Administración (`TeamLogosPanel.tsx`)

- **Ubicación:** `apps/web/src/features/team-logos/TeamLogosPanel.tsx:5-125`
- **Responsabilidad:** Renderizar la consola administrativa para la carga de nuevos archivos gráficos, la exploración de insignias existentes, la copia ágil de rutas absolutas al portapapeles y la eliminación segura mediante confirmación contextual.

### 2.1 Estructura Semántica del DOM

```tsx
// apps/web/src/features/team-logos/TeamLogosPanel.tsx:24-124
<section className="team-logos-panel" aria-labelledby="team-logos-title">
  <div className="content-manager-heading">
    <div>
      <span className="eyebrow">Identidad de los equipos</span>
      <h2 id="team-logos-title">Team Logos</h2>
      <p>Sube logos y copia su ruta para asignarla al equipo desde CRUD Operations.</p>
    </div>
  </div>
  ...
</section>
```

El componente se articula en cuatro secciones funcionales:

#### 1. Cabecera Informativa (`líneas 25-31`)
Presenta el contexto operativo vinculando la gestión de archivos gráficos con el panel de CRUD Operations, donde se asigna la ruta del logo a la columna `logo_url` de cada equipo.

#### 2. Formulario de Carga y Acciones (`líneas 32-62`)
- **Control de Archivo Accesible:** `<input type="file">` asociado a su etiqueta mediante `id="team-logo-file"` y `htmlFor="team-logo-file"`.
- **Filtro MIME:** La propiedad `accept="image/png,image/jpeg,image/webp"` (`línea 43`) restringe la selección nativa en el explorador de archivos.
- **Reseteo Atómico del Control:** Utiliza la clave dinámica `key={inputKey}` (`línea 40`). Tras cada subida completada con éxito, el gancho incrementa `inputKey`, forzando a React a reconstruir el elemento DOM del input y limpiando cualquier archivo residual.
- **Microtexto Normativo:** `<small>` (`líneas 47-50`) detalla los límites operativos: *"PNG, JPEG o WebP · Hasta 5 MB. Nombre con letras, números o guiones. No se sobrescriben archivos existentes."*
- **Botón de Envío:** `<button className="btn-primary" type="submit" disabled={!file || busy || loading}>` (`líneas 51-53`) condicionado por la presencia de un archivo seleccionado y el estado de reposo de la consola.
- **Actualización Manual:** `<button className="btn-ghost" type="button" disabled={busy || loading} onClick={() => void refresh()}>` (`líneas 55-62`) permite sincronizar la lista si otros administradores realizaron cambios concurrentes.

#### 3. Zona de Retroalimentación de Estado (`líneas 63-65`)
- **Alertas de Error:** `{error && <p role="alert">{error}</p>}` (`línea 63`) utiliza el rol WAI-ARIA `alert` para que los lectores de pantalla anuncien inmediatamente cualquier fallo de red o validación.
- **Salida Dinámica de Estado:** `<output>{loading ? 'Cargando logos…' : busy ? 'Procesando…' : message}</output>` (`línea 64`) unifica los estados de carga inicial, operación en curso y notificaciones de éxito (`"Logo FNX.webp subido."`, `"Ruta copiada."`).
- **Estado Vacío:** `{!loading && !error && logos.length === 0 && <p>No hay logos. Sube el primero.</p>}` (`línea 65`).

#### 4. Diálogo de Confirmación de Borrado (`líneas 66-88`)
Cuando un usuario selecciona eliminar un logo mutable, el estado `pendingDelete` activa un contenedor `<fieldset className="team-logo-confirm" aria-label="Confirmar eliminación">`:
- Informa del impacto en cascada: *`¿Eliminar {pendingDelete.name}? Los equipos que utilicen este logo dejarán de mostrarlo.`*
- Proporciona dos acciones explícitas:
  - `<button className="btn-primary" type="button" disabled={busy} onClick={() => void confirmDelete()}>Confirmar eliminación</button>`
  - `<button className="btn-ghost" type="button" disabled={busy} onClick={() => setPendingDelete(null)}>Cancelar</button>`

#### 5. Cuadrícula de Logos (`líneas 89-122`)
Renderiza una lista desordenada `<ul className="team-logos-grid">` donde cada elemento (`<li key={logo.name}>`) conforma una tarjeta de identidad:
- **Vista Previa de Imagen:** `<img src={logo.url} alt={`Logo ${logo.name}`} loading="lazy" />` (`línea 92`) con carga perezosa nativa.
- **Identificador de Archivo:** `<strong>{logo.name}</strong>` (`línea 93`) con rotura automática de texto (`overflow-wrap: anywhere`).
- **Ruta de Asignación Rápida:** `<input aria-label={`Ruta de ${logo.name}`} readOnly value={logo.url} onFocus={(event) => event.target.select()} />` (`líneas 94-99`). Al recibir el foco, selecciona automáticamente todo el texto para facilitar su copia manual con un solo clic.
- **Botón de Copia:** `<button className="btn-ghost" onClick={() => void copyUrl(logo)}>Copiar ruta</button>` (`líneas 100-107`) que transfiere la URL al portapapeles y notifica en `<output>`.
- **Protección de `placeholder.webp`:**
  - Si `logo.name.toLowerCase() === 'placeholder.webp'`: renderiza `<span className="team-logo-protected">Logo de reserva · Protegido</span>` (`líneas 108-110`), inhabilitando la acción de eliminación.
  - Para cualquier otro archivo: renderiza `<button className="btn-ghost team-logo-delete" onClick={() => setPendingDelete(logo)}>Eliminar {logo.name}</button>` (`líneas 111-119`).

---

## 3. Gancho Desacoplado de Estado y Mutaciones (`useTeamLogos.ts`)

- **Ubicación:** `apps/web/src/features/team-logos/hooks/useTeamLogos.ts:4-98`
- **Responsabilidad:** Aislar el ciclo de vida asíncrono, ejecutar validaciones preventivas en el cliente, despachar llamadas a `teamLogosApi` y mantener la coherencia del estado visual.

```typescript
// apps/web/src/features/team-logos/hooks/useTeamLogos.ts:4-13
export function useTeamLogos() {
  const [logos, setLogos] = useState<Logo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Logo | null>(null);
  const [inputKey, setInputKey] = useState(0);
  ...
```

### 3.1 Ciclo de Carga Inicial con Guardia de Desmontaje

El efecto de montaje (`apps/web/src/features/team-logos/hooks/useTeamLogos.ts:14-30`) consulta el catálogo de insignias protegiéndose contra fugas de memoria o actualizaciones de estado tardías:

```typescript
// apps/web/src/features/team-logos/hooks/useTeamLogos.ts:14-30
useEffect(() => {
  let active = true;
  teamLogosApi
    .list()
    .then((items) => {
      if (active) setLogos(items);
    })
    .catch((cause: Error) => {
      if (active) setError(cause.message);
    })
    .finally(() => {
      if (active) setLoading(false);
    });
  return () => {
    active = false;
  };
}, []);
```

Si el componente se desmonta antes de recibir la respuesta HTTP, la variable de cierre `active` se torna `false`, descartando cualquier llamada a `setLogos`, `setError` o `setLoading`.

### 3.2 Despachador de Mutaciones `run()`

Para evitar duplicación de lógica en el manejo de banderas asíncronas, el método privado `run` (`apps/web/src/features/team-logos/hooks/useTeamLogos.ts:32-43`) orquesta cada operación:

```typescript
// apps/web/src/features/team-logos/hooks/useTeamLogos.ts:32-43
async function run(operation: () => Promise<void>) {
  setBusy(true);
  setError('');
  setMessage('');
  try {
    await operation();
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.');
  } finally {
    setBusy(false);
  }
}
```

Garantiza que al iniciar cualquier mutación (`upload`, `refresh`, `confirmDelete`, `copyUrl`):
1. `busy` se establece en `true`, desactivando los botones de la interfaz.
2. Los mensajes previos de error y confirmación se restablecen.
3. Las excepciones se transforman en mensajes legibles en el estado `error`.
4. El bloque `finally` restaura `busy` a `false`.

### 3.3 Método `upload()` y Validaciones Preventivas en Cliente

```typescript
// apps/web/src/features/team-logos/hooks/useTeamLogos.ts:45-57
async function upload() {
  if (!file) return;
  await run(async () => {
    if (file.name.toLowerCase() === 'placeholder.webp')
      throw new Error('El logo de reserva está protegido y no se puede modificar.');
    if (file.size > 5 * 1024 * 1024) throw new Error('La imagen supera los 5 MB.');
    const logo = await teamLogosApi.upload(file);
    setLogos((items) => [...items, logo].sort((a, b) => a.name.localeCompare(b.name)));
    setFile(null);
    setInputKey((key) => key + 1);
    setMessage(`Logo ${logo.name} subido.`);
  });
}
```

- **Validación de Identificador Reservado (`línea 48`):** Impide el envío si el archivo se denomina `placeholder.webp` (evaluado de forma insensible a mayúsculas), protegiendo el logo base antes de consumir ancho de banda.
- **Validación de Peso Máximo (`línea 50`):** Intercepta archivos cuyo tamaño supere 5.242.880 bytes (`5 * 1024 * 1024`), evitando peticiones destinadas a fallar con HTTP 413.
- **Inserción y Ordenación Alfabética (`línea 52`):** Añade la nueva entidad `logo` retornada por la API y ordena inmediatamente la colección mediante `a.name.localeCompare(b.name)`, asegurando que la cuadrícula permanezca organizada sin requerir una recarga completa del servidor.
- **Reinicio del Selector de Archivo (`líneas 53-54`):** Limpia la referencia en memoria (`setFile(null)`) e incrementa `inputKey`, restableciendo el control nativo en el DOM.

### 3.4 Método `confirmDelete()`

```typescript
// apps/web/src/features/team-logos/hooks/useTeamLogos.ts:65-73
async function confirmDelete() {
  if (!pendingDelete) return;
  await run(async () => {
    await teamLogosApi.remove(pendingDelete.name);
    setLogos((items) => items.filter((logo) => logo.name !== pendingDelete.name));
    setMessage(`Logo ${pendingDelete.name} eliminado.`);
    setPendingDelete(null);
  });
}
```

Ejecuta la eliminación en el servidor mediante `DELETE /api/v1/team-logos/admin/:name` y actualiza la lista local filtrando el elemento eliminado sin necesidad de reconsultar el endpoint completo.

### 3.5 Método `copyUrl()`

```typescript
// apps/web/src/features/team-logos/hooks/useTeamLogos.ts:75-80
function copyUrl(logo: Logo) {
  return run(async () => {
    await navigator.clipboard.writeText(logo.url);
    setMessage('Ruta copiada.');
  });
}
```

Interactúa con la API nativa `navigator.clipboard` del navegador para copiar la ruta absoluta del logo y emitir confirmación en pantalla.

---

## 4. Insignia con Fallback Multinivel (`TeamBadge.tsx`)

- **Ubicación:** `apps/web/src/features/competition/components/TeamBadge.tsx:13-50`
- **Responsabilidad:** Renderizar el escudo oficial del equipo en clasificaciones, partidos y tablas, garantizando que jamás aparezca un elemento de imagen roto (`broken image icon`).

```tsx
// apps/web/src/features/competition/components/TeamBadge.tsx:11-22
const DEFAULT_LOGO_URL = `${teamLogoDirectory}placeholder.webp`;

export function TeamBadge({ team }: TeamBadgeProps) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const resolvedUrl = resolveTeamLogo(team?.logoUrl);
  let activeUrl: string | null = null;
  if (resolvedUrl && !failedUrls.has(resolvedUrl)) {
    activeUrl = resolvedUrl;
  } else if (!failedUrls.has(DEFAULT_LOGO_URL)) {
    activeUrl = DEFAULT_LOGO_URL;
  }
  ...
```

### 4.1 Estrategia de Degradación Progresiva

El componente resuelve la URL activa mediante tres niveles jerárquicos:

```
[ team.logoUrl ] ───(resolveTeamLogo)───> [ resolvedUrl ]
                                                │
                                    ¿Falla o Ausente?
                                                │
                                                ▼
                                    [ DEFAULT_LOGO_URL ]
                                 (placeholder.webp de la API)
                                                │
                                             ¿Falla?
                                                │
                                                ▼
                                    [ Iniciales de Texto ]
                               (p. ej. "FNX", "K02", "???")
```

1. **Nivel 1 (Logo Específico):** Se obtiene mediante `resolveTeamLogo(team?.logoUrl)`. Si existe y su URL no se encuentra registrada en el conjunto local `failedUrls`, se asigna como `activeUrl`.
2. **Nivel 2 (Logo por Defecto de la API):** Si la URL del equipo está ausente o su carga provocó un evento `onError`, el componente evalúa si `DEFAULT_LOGO_URL` (`/api/v1/team-logos/images/placeholder.webp`) no ha fallado previamente. En caso afirmativo, la utiliza como reemplazo automático.
3. **Nivel 3 (Iniciales de Texto):** Si el logo por defecto tampoco puede cargarse o no está disponible, `activeUrl` se establece en `null`. El componente renderiza un texto con las iniciales en mayúsculas: `(team?.shortName ?? team?.name ?? '?').slice(0, 3).toUpperCase()` (`línea 47`).

### 4.2 Controlador de Fallo de Carga (`onError`)

```tsx
// apps/web/src/features/competition/components/TeamBadge.tsx:40-42
onError={() => {
  setFailedUrls((prev) => new Set(prev).add(currentUrl));
}}
```

Cuando el navegador dispara el evento `onError` en el tag `<img>`, la función añade la URL fallida al conjunto reactivo `failedUrls`. Esto desencadena un re-renderizado determinista hacia el siguiente nivel de fallback sin bloquear la interfaz ni requerir intervención del servidor.

### 4.3 Ajuste Geométrico de Proporción (`teamLogoBounds`)

```tsx
// apps/web/src/features/competition/components/TeamBadge.tsx:23-25, 34-37
const bounds = activeUrl?.startsWith(teamLogoDirectory)
  ? teamLogoBounds[activeUrl.slice(teamLogoDirectory.length)]
  : undefined;

...
<img
  className={bounds ? 'team-logo-normalized' : undefined}
  style={bounds}
  src={currentUrl}
  alt=""
  loading="lazy"
  onError={...}
/>
```

Si la imagen proviene del directorio administrado de logos (`teamLogoDirectory`), se consultan las proporciones precalculadas en `teamLogoBounds` (`apps/web/src/shared/resources/team-logo-bounds.ts`), aplicando estilos de contención específicos para evitar deformaciones visuales en emblemas rectangulares o apaisados.

---

## 5. Integración en Rutas y Administración (`AdminPage.tsx` y `routes.tsx`)

### 5.1 Enrutamiento Canónico (`routes.tsx`)

En `apps/web/src/site/routes.tsx:145`, el array `adminRoutes` declara formalmente el endpoint:

```typescript
// apps/web/src/site/routes.tsx:139-147
export const adminRoutes = [
  { path: '/admin/home-content', title: 'Contenido de la home' },
  { path: '/admin', title: 'Admin' },
  { path: '/admin/rofl/upload', title: 'ROFL Upload' },
  { path: '/admin/crud', title: 'CRUD Operations' },
  { path: '/admin/member-roles', title: 'Gestión de roles' },
  { path: '/admin/team-logos', title: 'Team Logos' },
  { path: '/admin/database-transfer', title: 'Database Transfer' }
];
```

La función `resolveSiteRoute('/admin/team-logos')` resuelve la ruta retornando el título compuesto `'Team Logos · Admin'` y montando el componente `<AdminPage path="/admin/team-logos" wsUrl={wsUrl} />` (`líneas 178-188`).

### 5.2 Navegación y Barrera de Seguridad (`AdminPage.tsx`)

En `apps/web/src/site/pages/admin/AdminPage.tsx:22-118`, toda la vista se encuentra protegida por el componente perimetral `<RequireAdmin>`:

- **Pestaña en la Barra de Navegación:**
  ```tsx
  // apps/web/src/site/pages/admin/AdminPage.tsx:46-50
  <SiteLink
    href="/admin/team-logos"
    aria-current={path === '/admin/team-logos' ? 'page' : undefined}
  >
    Team Logos
  </SiteLink>
  ```
- **Montaje Condicional del Panel:**
  ```tsx
  // apps/web/src/site/pages/admin/AdminPage.tsx:58-60
  {path === '/admin/team-logos' ? (
    <TeamLogosPanel />
  ) : ...}
  ```
- **Tarjeta Informativa en la Vista General:**
  ```tsx
  // apps/web/src/site/pages/admin/AdminPage.tsx:104-109
  <SiteLink href="/admin/team-logos">
    <span className="eyebrow">Equipos</span>
    <h2>Team Logos</h2>
    <p>Consulta, sube y elimina los logos de los equipos.</p>
    <span>Gestionar logos →</span>
  </SiteLink>
  ```

---

## 6. Arquitectura de Estilos CSS (`team-logos.css`)

- **Ubicación:** `apps/web/src/features/team-logos/team-logos.css:1-24`
- **Ámbito:** Todos los selectores están encapsulados bajo el contenedor de aplicación `.rcl-site` para evitar colisiones con estilos globales.

### Catálogo de Clases y Propiedades Visuales

| Selector | Reglas Principales | Propósito |
|---|---|---|
| `.rcl-site .team-logos-panel` | `min-width: 0;` | Previene desbordamientos en contenedores flex/grid. |
| `.rcl-site .team-logos-panel h2` | `font: 700 42px/1 var(--display2); margin: 0 0 12px;` | Tipografía monumental unificada con las demás secciones administrativas. |
| `.rcl-site .team-logos-panel form` | `display: grid; gap: 12px; margin: 24px 0; padding: 20px; background: var(--panel); border: 1px solid var(--line);` | Panel contenedor elevado para el formulario de subida. En pantallas $\ge 651\text{px}$ expande el padding a `28px` (`línea 23`). |
| `.rcl-site .team-logos-panel input` | `box-sizing: border-box; width: 100%; min-height: 44px; padding: 10px 12px; background: var(--void); color: var(--text); border: 1px solid var(--line);` | Campo oscuro estandarizado con contraste alto y soporte de `color-scheme: dark`. |
| `.rcl-site .team-logos-panel input::file-selector-button` | `padding: 8px 12px; margin-right: 12px; background: var(--panel-raised); border: 1px solid var(--line); cursor: pointer;` | Botón nativo de selección de archivo estilizado. |
| `.rcl-site .team-logos-panel :is(button, input):focus-visible` | `outline: 2px solid var(--lime); outline-offset: 3px;` | Anillo accesible de navegación por teclado en color verde lima corporativo. |
| `.rcl-site .team-logos-panel :disabled` | `cursor: not-allowed; opacity: .5;` | Retroalimentación visual estándar para elementos bloqueados durante operaciones activas. |
| `.rcl-site .team-logos-panel output` | `display: block; margin: 16px 0; color: var(--lime);` | Texto de estado destacado en verde lima. |
| `.rcl-site .team-logos-panel [role='alert']` | `color: #ff9d9d;` | Alertas de error en tono rojo pastel de alto contraste sobre fondo oscuro. |
| `.rcl-site .team-logos-grid` | `display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: 20px; list-style: none;` | Cuadrícula responsiva que se adapta dinámicamente desde móviles hasta monitores anchos. |
| `.rcl-site .team-logos-grid li` | `display: grid; gap: 12px; padding: 20px; background: var(--panel); border: 1px solid var(--line);` | Tarjeta individual de insignia. |
| `.rcl-site .team-logos-grid img` | `width: 100%; height: 120px; object-fit: contain; padding: 12px; background: var(--void);` | Contenedor de visualización cuadrada con ajuste de aspecto sin recortes. |
| `.rcl-site .team-logos-grid input` | `font: 400 12px var(--mono);` | Caja de texto monospace para rutas legibles. |
| `.rcl-site .team-logo-protected` | `color: var(--lime); font: 400 12px var(--mono); align-self: center;` | Indicador textual para la insignia base protegida. |
| `.rcl-site .team-logo-delete` | `color: #ff9d9d;` | Botón destructivo con color de advertencia. |
| `.rcl-site .team-logo-confirm` | `padding: 20px; background: var(--panel); border: 1px solid var(--line); border-top: 3px solid var(--lime);` | Caja de confirmación destacada con borde superior decorativo. |

---

## 7. Verificación Mediante Pruebas Automatizadas

La integración y correcto renderizado del panel se valida en la suite de pruebas unitarias de renderizado del cliente:

### Caso de Prueba en `tests/unit/render/AdminPage.test.tsx:35-45`

```typescript
// tests/unit/render/AdminPage.test.tsx:35-45
it('mounts logo management for administrators', () => {
  const html = renderSession(
    { status: 'authenticated', user: admin },
    false,
    '/admin/team-logos'
  );
  expect(html).toContain('Team Logos');
  expect(html).toContain('Subir logo');
  expect(html).toContain('Cargando logos');
  expect(html).toContain('href="/admin/team-logos"');
});
```

Esta prueba certifica que:
1. Al acceder con una sesión autorizada con rol `admin` a la ruta `/admin/team-logos`, el componente monta `TeamLogosPanel`.
2. Se renderiza el título principal `'Team Logos'`.
3. El botón de subida de archivo `'Subir logo'` está presente en el marcado HTML.
4. El indicador inicial `'Cargando logos'` se genera en el bloque `<output>`.
5. El enlace de navegación activo `href="/admin/team-logos"` está disponible en la barra de navegación administrativa.
