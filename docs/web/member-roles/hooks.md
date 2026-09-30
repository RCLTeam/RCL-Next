# Gestión de Estado y Transporte: Web Member Roles

[⬅️ Volver a Componentes de Presentación](components.md) | [Siguiente: Vistas Ensambladoras ➡️](pages.md)

---

## 1. Arquitectura de Estado de Cliente

Conforme al análisis de código vivo del repositorio, **no existe un hook desacoplado denominado `useMemberRoles.ts`**. En su lugar, el estado reactivo, la paginación y la interacción de red se orquestan directamente dentro de `MemberRolesPanel.tsx:9-67` consumiendo el cliente de transporte tipado `apps/web/src/features/member-roles/api/member-roles-api.ts`.

### 1.1 Variables de Estado del Panel (`MemberRolesPanel`)

```typescript
const [search, setSearch] = useState('');
const [offset, setOffset] = useState(0);
const [revision, setRevision] = useState(0);
const [page, setPage] = useState<MemberRolesPage | null>(null);
const [error, setError] = useState('');
const [notice, setNotice] = useState('');
const [busy, setBusy] = useState(false);
const [loading, setLoading] = useState(true);
const [change, setChange] = useState<{ member: RoleMember; role: MemberRole } | null>(null);
```

- `search`: Texto ingresado en el buscador para filtrar miembros.
- `offset`: Desplazamiento actual para la paginación en múltiplos de 50.
- `revision`: Clave numérica de versión que, al incrementarse, desencadena una recarga limpia del listado.
- `page`: Datos de la página actual (`{ members, hasMore }`).
- `busy`: Bloquea los controles interactivos durante el envío de peticiones `PATCH`.
- `loading`: Indica si la petición de consulta de miembros está en progreso.
- `change`: Contiene la tupla `{ member, role }` seleccionada para confirmación previa.

---

## 2. Búsqueda con *Debounce* de 200 ms y `AbortController`

Para evitar saturar la base de datos con peticiones en cada pulsación de tecla y evitar condiciones de carrera si una consulta lenta responde después de una rápida, el efecto de carga (`MemberRolesPanel.tsx:22-46`) combina temporizador y cancelación de señal:

```typescript
useEffect(() => {
  const controller = new AbortController();
  setLoading(true);
  setPage(null);
  setError('');
  const timer = window.setTimeout(() => {
    getRoleMembers(search, offset, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPage(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : 'No se pudieron cargar los miembros.'
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, 200);
  return () => {
    window.clearTimeout(timer);
    controller.abort();
  };
}, [search, offset, revision]);
```

### Propiedades Clave:
- **Retardo de 200 ms:** Agrupa las pulsaciones del usuario en una única petición de búsqueda.
- **Cancelación Inmediata:** Si el usuario teclea un nuevo carácter antes de 200 ms, la función de limpieza cancela el temporizador anterior con `window.clearTimeout(timer)` y aborta cualquier petición de red en vuelo con `controller.abort()`.

---

## 3. Flujo de Mutación y Sincronización de Sesión (`saveRole`)

La función `saveRole` (`MemberRolesPanel.tsx:47-67`) ejecuta la mutación atómica en el backend:

```typescript
async function saveRole() {
  if (!change || !canManage || busy) return;
  setBusy(true);
  setError('');
  setNotice('');
  try {
    await changeMemberRole(change.member.discordId, {
      role: change.role,
      expectedRole: change.member.role
    });
    setNotice(`Rol de ${change.member.username} actualizado a ${change.role}.`);
    setChange(null);
    setRevision((value) => value + 1);
    if (state.status === 'authenticated' && change.member.discordId === state.user.discordId)
      refreshSession();
  } catch (error) {
    setError(error instanceof Error ? error.message : 'No se pudo cambiar el rol.');
  } finally {
    setBusy(false);
  }
}
```

### Aspectos Destacados:
- **Paso de `expectedRole`:** Proporciona `change.member.role` para validar el bloqueo optimista en el servidor.
- **Incremento de `revision`:** Fuerza la recarga inmediata de la tabla para reflejar el estado consolidado.
- **Detección de Auto-Degradación:** Si el usuario que opera es el mismo al que se le modifica el rol, ejecuta `refreshSession()`, sincronizando el `AuthContext` global para revocar sus propios privilegios de forma instantánea.

---

## 4. Capa de Transporte de Cliente (`member-roles-api.ts`)

En `apps/web/src/features/member-roles/api/member-roles-api.ts:1-43`, las funciones HTTP mapean los errores técnicos de la API a mensajes legibles en español:

```typescript
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/member-roles${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'La sesión ha caducado. Vuelve a iniciar sesión.',
      403: 'Solo un owner puede modificar los roles.',
      404: 'El miembro ya no existe.',
      422: 'El cambio de rol no es válido.'
    };
    const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : null;
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
    if (code === 'LAST_OWNER')
      throw new Error('No puedes quitar el rol al último owner. Asigna otro primero.');
    if (response.status === 409)
      throw new Error('El rol ha cambiado. Actualiza la lista antes de volver a guardarlo.');
    throw new Error(
      messages[response.status] ?? 'No se pudo completar la operación. Inténtalo de nuevo.'
    );
  }
  if (typeof body !== 'object' || body === null || !('data' in body))
    throw new Error('La respuesta de miembros no es válida.');
  return body.data as T;
}
```

### Funciones Exportadas:
1. `getRoleMembers(search: string, offset: number, signal: AbortSignal)`: Emite `GET /api/v1/member-roles?search=...&offset=...`.
2. `changeMemberRole(memberId: string, change: ChangeMemberRole)`: Emite `PATCH /api/v1/member-roles/:discordId` enviando `{ role, expectedRole }`.
