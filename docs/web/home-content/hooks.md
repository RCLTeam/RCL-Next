# Hooks Headless y Cliente API: Editorial Home Content

[⬅️ Volver a Componentes](components.md) | [Siguiente: Páginas ➡️](pages.md)

---

## 1. Visión General de la Capa de Sincronización

La comunicación con el backend, el control de concurrencia y la gestión del ciclo de vida asíncrono para el contenido editorial y los quintetos ideales se aíslan en:
1. **Hook Headless `useHomeContent` (`apps/web/src/features/home-content/useHomeContent.ts:1-38`):** Encargado de la recuperación reactiva de datos, reintentos y cancelación de peticiones en vuelo.
2. **Cliente API Tipado `home-content-api.ts` (`apps/web/src/features/home-content/home-content-api.ts:1-44`):** Centraliza las llamadas HTTP con `fetch`, inyecta credenciales seguras, desactiva la caché del cliente y transforma códigos de error HTTP en mensajes legibles en español.

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
// apps/web/src/features/home-content/home-content-api.ts:31-44
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

export const saveWeeklyTeam = (id: string, input: WeeklyTeamInput) =>
  contentRequest<WeeklyTeam>(`admin/weekly-teams/${id}`, json('PUT', input));
```

- **`saveArticle`:** Conmuta de forma transparente entre `POST /admin/articles` (creación cuando `id === null`) y `PUT /admin/articles/:id` (actualización cuando `id` existe). Incluye la lista de `uploadedImages` para alimentar el recolector de basura de imágenes en el servidor.
- **`deleteArticle`:** Ejecuta `DELETE /admin/articles/:id` para purgar el artículo y disparar la eliminación de imágenes huérfanas asociadas.
- **`saveWeeklyTeam`:** Emite `PUT /admin/weekly-teams/:id`, donde `:id` representa el UUID de la división deportiva.
