# Hooks Headless y Cliente API: Editorial Home Content

[⬅️ Volver a Componentes](components.md) | [Siguiente: Páginas ➡️](pages.md)

---

## 1. Visión General de la Capa de Sincronización y Navegación

La comunicación con el backend, el control de concurrencia, la protección contra pérdida de datos no guardados y la gestión del ciclo de vida asíncrono para el contenido editorial y los quintetos ideales se aíslan en:
1. **Hook Headless `useHomeContent` (`apps/web/src/features/home-content/useHomeContent.ts:4-37`):** Encargado de la recuperación reactiva de datos, reintentos y cancelación de peticiones en vuelo con `AbortController`.
2. **Cliente API Tipado `home-content-api.ts` (`apps/web/src/features/home-content/home-content-api.ts:3-48`):** Centraliza las llamadas HTTP con `fetch`, inyecta credenciales seguras, desactiva la caché del cliente, transforma códigos de error HTTP en mensajes legibles en español y expone mutaciones como `discardImages` con `keepalive: true`.
3. **Guardia de Abandono de Editor `useEditorLeaveGuard` y `editorLeaveHandlers` (`apps/web/src/features/home-content/useEditorLeaveGuard.ts:4-29`):** Intercepta la salida del formulario cuando existen mutaciones en curso o cambios sin guardar, coordinando diálogos de confirmación y eventos nativos `beforeunload`.
4. **Gestión de Navegación y Pila de Historial `browserNavigation` (`apps/web/src/shared/browser-navigation.ts:3-44`):** Rastrea las transiciones del navegador mediante un índice incremental (`rclIndex`), revirtiendo la pila ante cancelaciones del usuario sin generar entradas duplicadas.
5. **Gestor de Imágenes Temporales `PendingImages` (`apps/web/src/features/home-content/pending-images.ts:3-37`):** Administra el conjunto de URLs de imágenes subidas durante una sesión de edición, coordinando su persistencia o su descarte asíncrono.

---

## 2. Hook Headless `useHomeContent<T>`

```typescript
// apps/web/src/features/home-content/useHomeContent.ts:4-37
export function useHomeContent<T>(path: string | null) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    revision: number;
    data?: T;
    error?: string;
  }>();

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    contentRequest<T>(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ path, revision, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            path,
            revision,
            error: error instanceof Error ? error.message : 'No se pudo cargar el contenido.'
          });
      }
    );
    return () => controller.abort();
  }, [path, revision]);

  const current = result?.path === path && result?.revision === revision ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: !!path && !current,
    retry: () => setRevision((value) => value + 1)
  };
}
```

### Garantías de Ingeniería de `useHomeContent`:
1. **Cancelación Automática con `AbortController`:** Cada vez que el parámetro `path` cambia o el usuario invoca `retry()` (que incrementa `revision`), la función de limpieza del efecto ejecuta `controller.abort()`, interrumpiendo de inmediato la transferencia de red en curso y evitando consumo innecesario de ancho de banda.
2. **Inmunidad ante Condiciones de Carrera:**
   ```typescript
   const current = result?.path === path && result?.revision === revision ? result : undefined;
   ```
   Si una petición lenta responde después de que el usuario haya seleccionado una jornada o artículo diferente, el resultado devuelto no coincidirá con la tupla `(path, revision)` activa, siendo ignorado automáticamente.
3. **Estado de Carga Determinista:** La bandera `loading` se calcula de forma derivada (`!!path && !current`), garantizando que la interfaz no parpadee ni muestre estados inconsistentes.

---

## 3. Cliente de API (`home-content-api.ts`)

### 3.1 Petición Centralizada `contentRequest<T>`

```typescript
// apps/web/src/features/home-content/home-content-api.ts:3-25
export async function contentRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/home-content/${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'La sesión ha caducado. Inicia sesión de nuevo.',
      403: 'No tienes permiso para realizar esta operación.',
      404: 'El contenido no está disponible.',
      413: 'La imagen supera el límite de 5 MB.',
      422: 'Revisa los campos y el formato de las imágenes.'
    };
    throw new Error(
      messages[response.status] ?? 'No se pudo cargar o guardar el contenido. Inténtalo de nuevo.'
    );
  }
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('data' in body))
    throw new Error('Respuesta no válida.');
  return body.data as T;
}
```

- **Inclusión de Credenciales:** Inyecta `credentials: 'include'` para enviar las cookies seguras de sesión de Discord en todas las peticiones a la API.
- **Supresión de Caché:** Inyecta `cache: 'no-store'` para obligar al navegador a consultar siempre la versión más reciente del recurso.
- **Mapeo de Errores Amigables:** Traduce los códigos de error HTTP a mensajes explicativos orientados al usuario final, encapsulándolos en excepciones estándar de JavaScript.
- **Validación del Envelope `data`:** Verifica que el cuerpo de la respuesta contenga el contenedor canónico `{ data: ... }`, rechazando payloads corruptos o respuestas de proxy inesperadas.

---

### 3.2 Operaciones de Mutación Administrativa

```typescript
// apps/web/src/features/home-content/home-content-api.ts:31-48
export const saveArticle = (
  id: string | null,
  input: EditorialInput,
  uploadedImages: string[] = []
) =>
  contentRequest<EditorialArticle>(
    `admin/articles${id ? `/${id}` : ''}`,
    json(id ? 'PUT' : 'POST', { ...input, uploadedImages })
  );

export const deleteArticle = (id: string) =>
  contentRequest<null>(`admin/articles/${id}`, { method: 'DELETE' });

export const discardImages = (urls: string[]) =>
  contentRequest<null>('admin/images/discard', {
    ...json('POST', { urls }),
    keepalive: true
  });

export const saveWeeklyTeam = (id: string, input: WeeklyTeamInput) =>
  contentRequest<WeeklyTeam>(`admin/weekly-teams/${id}`, json('PUT', input));
```

- **`saveArticle`:** Conmuta de forma transparente entre `POST /admin/articles` (creación cuando `id === null`) y `PUT /admin/articles/:id` (actualización cuando `id` existe). Incluye la lista de `uploadedImages` para alimentar el recolector de basura de imágenes en el servidor.
- **`deleteArticle`:** Ejecuta `DELETE /admin/articles/:id` para purgar el artículo y disparar la eliminación de imágenes huérfanas asociadas.
- **`discardImages`:** Ejecuta `POST /admin/images/discard` enviando las URLs de imágenes subidas que no llegaron a persistirse. Inyecta `keepalive: true` para que la petición HTTP finalice con éxito incluso si el usuario navega a otra pantalla o cierra la ventana.
- **`saveWeeklyTeam`:** Emite `PUT /admin/weekly-teams/:id`, donde `:id` representa el UUID de la división deportiva.

---

## 4. Guardias de Navegación y Prevención de Pérdida de Datos

### 4.1 `useEditorLeaveGuard` y Manejadores de Abandono (`apps/web/src/features/home-content/useEditorLeaveGuard.ts:4-29`)

Para evitar la pérdida accidental de trabajo cuando el redactor tiene cambios sin guardar o una subida en curso, el sistema desacopla los manejadores de guardia del hook de React:

```typescript
// apps/web/src/features/home-content/useEditorLeaveGuard.ts:4-29
export function editorLeaveHandlers(dirty: boolean, busy: boolean) {
  return {
    canLeave() {
      if (busy) return false;
      return !dirty || window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?');
    },
    beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty && !busy) return;
      event.preventDefault();
      event.returnValue = '';
    }
  };
}

export function useEditorLeaveGuard(dirty: boolean, busy: boolean) {
  const { setLeaveGuard } = useNavigation();
  useEffect(() => {
    const { canLeave, beforeUnload } = editorLeaveHandlers(dirty, busy);
    setLeaveGuard?.(canLeave);
    if (dirty || busy) window.addEventListener('beforeunload', beforeUnload);
    return () => {
      setLeaveGuard?.(null);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [dirty, busy, setLeaveGuard]);
}
```

#### Mecanismos de Protección:
1. **Bloqueo Incondicional Durante Mutaciones (`busy`):** Si `busy` es `true`, `canLeave()` retorna inmediatamente `false`. Esto previene que una navegación interna interrumpa una subida de imagen binaria o la serialización de un guardado en curso.
2. **Confirmación de Descarte (`dirty`):** Si el formulario contiene campos modificados sin persistir (`dirty === true`), `canLeave()` ejecuta `window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')`. Si el usuario pulsa Cancelar, la navegación interna queda completamente cancelada.
3. **Manejador Nativo `beforeunload`:** Cuando el usuario recarga la página, ingresa una URL externa o cierra la pestaña, el manejador `beforeUnload` ejecuta `event.preventDefault()` y asigna `event.returnValue = ''`. Esto activa el diálogo de confirmación estándar provisto por el motor del navegador.
4. **Integración con `NavigationContext`:** El hook consume `setLeaveGuard` desde `useNavigation()` (`apps/web/src/shared/navigation.ts:7, 17-19`), registrando la función `canLeave` en el enrutador de nivel superior de la aplicación. Al desmontar el componente o cambiar las dependencias, la guardia se limpia pasando `null`.

---

### 4.2 Intercepción y Control de Pila en `browserNavigation` (`apps/web/src/shared/browser-navigation.ts:3-44`)

La navegación en el cliente gestiona la pila del historial del navegador garantizando que una cancelación de salida no contamine el historial con entradas duplicadas:

```typescript
// apps/web/src/shared/browser-navigation.ts:3-44
export function browserNavigation(
  onNavigate: (path: string) => void,
  canLeave: () => boolean,
  browser: Window = window
) {
  let index = Number(browser.history.state?.rclIndex ?? 0);
  let restoring = false;
  browser.history.replaceState({ ...browser.history.state, rclIndex: index }, '');
  const onPopState = (event: PopStateEvent) => {
    if (restoring) {
      restoring = false;
      return;
    }
    const nextIndex = event.state?.rclIndex;
    if (typeof nextIndex !== 'number') {
      browser.location.reload();
      return;
    }
    if (!canLeave()) {
      restoring = true;
      browser.history.go(index - nextIndex);
      return;
    }
    index = nextIndex;
    onNavigate(browser.location.pathname);
  };
  browser.addEventListener('popstate', onPopState);
  return {
    navigate(path: string) {
      if (restoring || path === browser.location.pathname || !canLeave()) return false;
      index++;
      browser.history.pushState({ rclIndex: index }, '', path);
      onNavigate(path);
      return true;
    },
    dispose() {
      browser.removeEventListener('popstate', onPopState);
    }
  };
}
```

#### Protocolo de Restauración de Historial:
1. **Marcado de Entradas con `rclIndex`:** Al inicializarse, asigna una propiedad numérica `rclIndex` al estado de la historia (`browser.history.replaceState`), utilizándola como cursor de posición ordinal.
2. **Navegación Programática (`navigate`):** Comprueba `if (restoring || path === browser.location.pathname || !canLeave()) return false;`. Solo cuando `canLeave()` aprueba la transición, incrementa `index++` y agrega la nueva entrada mediante `browser.history.pushState({ rclIndex: index }, '', path)`.
3. **Rebobinado ante Salida Cancelada en `popstate`:** Cuando el usuario pulsa los botones de retroceso o avance del navegador y la guardia `canLeave()` devuelve `false` (el redactor cancela el diálogo), `browserNavigation` activa la bandera `restoring = true` y ejecuta:
   ```typescript
   browser.history.go(index - nextIndex);
   ```
   Esto fuerza al navegador a viajar en la pila el delta exacto entre la posición actual y la solicitada, restaurando la posición original en lugar de añadir duplicados.
4. **Protección Contra Entradas Foráneas:** Si el usuario retrocede a una página externa a la aplicación donde `nextIndex` no es un número (`typeof nextIndex !== 'number'`), fuerza una recarga de documento con `browser.location.reload()`, lo que somete la salida al manejador nativo `beforeunload` del editor.
5. **Bandera Reentrante `restoring`:** Cuando `browser.history.go` se ejecuta, el navegador emite un nuevo evento `popstate`. La bandera `restoring` intercepta este disparo sintético, reseteándola y retornando de inmediato para evitar evaluaciones redundantes o bucles infinitos.

---

## 5. Gestor de Ciclo de Vida de Imágenes Pendientes (`PendingImages`)

El ciclo de vida de los archivos multimedia subidos durante la redacción se coordina en la clase `PendingImages` (`apps/web/src/features/home-content/pending-images.ts:3-37`):

```typescript
// apps/web/src/features/home-content/pending-images.ts:3-37
export class PendingImages {
  private readonly urls = new Set<string>();
  private disposed = false;
  private saving = false;
  constructor(private readonly remove: (urls: string[]) => Promise<unknown>) {}
  resume() {
    this.disposed = false;
  }
  add(url: string) {
    this.urls.add(url);
    if (this.disposed) this.cleanup();
  }
  dispose() {
    this.disposed = true;
    this.cleanup();
  }
  async save<T>(persist: (urls: string[]) => Promise<T>): Promise<T> {
    this.saving = true;
    try {
      const result = await persist([...this.urls]);
      this.urls.clear();
      return result;
    } finally {
      this.saving = false;
      if (this.disposed) this.cleanup();
    }
  }
  private cleanup() {
    if (this.saving || !this.urls.size) return;
    const urls = [...this.urls];
    this.urls.clear();
    void this.remove(urls).catch(() => {});
  }
}
```

### Garantías de Limpieza y Concurrencia:
1. **Seguimiento en `Set<string>`:** Cada imagen subida mediante el selector se registra en el conjunto `urls` mediante `add(url)`.
2. **Pospuesto de Limpieza Durante el Guardado (`save`):**
   - Cuando se pulsa Guardar, `save` marca `this.saving = true` antes de invocar la función de persistencia `persist([...this.urls])`.
   - Si la llamada a la API tiene éxito, `this.urls.clear()` vacía la colección, pues las imágenes ahora pertenecen a un artículo guardado en la base de datos.
   - Si la llamada a la API falla (por error de validación o red), `this.urls.clear()` **no** se ejecuta; las imágenes se conservan en memoria para que el usuario pueda corregir el error y reintentar sin perder las referencias.
   - En el bloque `finally`, se restablece `this.saving = false`. Si el componente se desmontó o la página se ocultó mientras la petición estaba en vuelo (`this.disposed === true`), se dispara inmediatamente `this.cleanup()`. Esto elimina la condición de carrera en la que un descarte prematuro borraría imágenes que estaban a punto de enlazarse.
3. **Descarte Asíncrono no Bloqueante (`cleanup`):**
   - Si `this.saving` está activo o `this.urls` está vacío, no realiza ninguna acción.
   - Si existen URLs sin persistir, copia las URLs, vacía el conjunto y despacha la función inyectada `remove(urls)`.
   - La llamada se ejecuta con `void this.remove(urls).catch(() => {})`, evitando bloquear la interfaz o arrojar errores no controlados.
4. **Transporte Seguro con `keepalive: true`:** La función `remove` suministrada es `discardImages` (`apps/web/src/features/home-content/home-content-api.ts:42-46`), la cual emite `POST /api/v1/home-content/admin/images/discard` configurando `keepalive: true` en el `fetch`. Esto garantiza que la petición de limpieza en el servidor continúe su curso aunque la pestaña del navegador se cierre inmediatamente.
