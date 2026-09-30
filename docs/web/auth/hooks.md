# Hooks Headless y Gestión de Estado: Web Auth

[⬅️ Volver a Componentes de Presentación](components.md) | [Siguiente: Integración en Páginas ➡️](pages.md)

---

## 1. El Hook `useAuth`

El hook `useAuth` (`apps/web/src/features/auth/components/AuthProvider.tsx:25-27`) es la interfaz pública para consumir el contexto de sesión en cualquier punto del árbol de componentes de React:

```typescript
export function useAuth() {
  return useContext(AuthContext);
}
```

Devuelve un objeto que implementa la interfaz `AuthSession` (`AuthProvider.tsx:9-15`):
- `state` (*AuthState*): Estado actual de la sesión.
- `signingOut` (*boolean*): Bandera que indica si una petición de logout se encuentra en tránsito.
- `logoutError` (*boolean*): Bandera que indica si el último intento de logout falló.
- `retry` (*() => void*): Función para solicitar una nueva verificación de sesión contra la API.
- `logout` (*() => Promise<void>*): Función asíncrona para cerrar la sesión actual e invalidar cookies.

---

## 2. Predicado de Autorización (`canAccessAdmin`)

En `AuthProvider.tsx:29-31`, se implementa una función pura para evaluar si un estado de sesión permite acceder a vistas de administración:

```typescript
export function canAccessAdmin(state: AuthState): boolean {
  return state.status === 'authenticated' && ['admin', 'owner'].includes(state.user.role);
}
```

Esta función garantiza que tanto los usuarios con rol `'admin'` como los que poseen rango `'owner'` puedan franquear las barreras de control de acceso en el frontend.

---

## 3. Ciclo de Vida y Arquitectura de `AuthProvider`

El componente `AuthProvider` (`apps/web/src/features/auth/components/AuthProvider.tsx:33-81`) encapsula la lógica asíncrona de comprobación de sesión mediante un efecto reactivo gobernado por `AbortController`:

```typescript
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    getSession(controller.signal)
      .then((user) => {
        if (!controller.signal.aborted)
          setState(user ? { status: 'authenticated', user } : { status: 'anonymous' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [attempt]);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError(false);
    try {
      await endSession();
      setState({ status: 'anonymous' });
    } catch {
      setLogoutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        state,
        signingOut,
        logoutError,
        retry: () => setAttempt((value) => value + 1),
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
```

### Garantías del Ciclo de Vida:
1. **Cancelación Limpia ante Desmontaje:** Cada ciclo de `useEffect` crea un nuevo `AbortController`. Si el usuario navega fuera o el componente se desmonta antes de recibir la respuesta de `/api/v1/auth/me`, la función de limpieza ejecuta `controller.abort()`, evitando actualizaciones sobre componentes desmontados (*memory leaks* o advertencias de React).
2. **Reintentos Deterministas:** La función `retry()` incrementa el contador `attempt`, forzando la ejecución de una nueva petición cancelable.
3. **Protección Anti-Doble Clic en Logout:** `if (signingOut) return` impide que pulsaciones múltiples concurrentes sobre el botón de cerrar sesión disparen peticiones HTTP paralelas a `/api/v1/auth/logout`.

---

## 4. Capa de Transporte de Cliente (`auth-api.ts`)

Las llamadas HTTP a nivel de navegador se aíslan en `apps/web/src/features/auth/api/auth-api.ts:1-41`:

### 4.1 `getSession(signal?: AbortSignal)`
```typescript
export async function getSession(signal?: AbortSignal): Promise<AuthUser | null> {
  const response = await fetch('/api/v1/auth/me', {
    credentials: 'include',
    cache: 'no-store',
    ...(signal ? { signal } : {})
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('No se pudo comprobar la sesión. Inténtalo de nuevo.');
  const body: unknown = await response.json();
  const user = typeof body === 'object' && body !== null && 'data' in body ? body.data : null;
  // Validación estricta en runtime de cada propiedad requerida...
  return user as AuthUser;
}
```
- Emite credenciales de cookies (`credentials: 'include'`).
- Mapea de forma limpia el código HTTP 401 devolviendo `null` (lo cual transiciona el estado a `'anonymous'`).
- Aplica una exhaustiva validación en tiempo de ejecución (`auth-api.ts:16-30`) verificando tipos de `discordId`, `username`, `globalName`, `avatarHash` y `role`, rechazando respuestas corruptas o malformadas.

### 4.2 `endSession()`
```typescript
export async function endSession(): Promise<void> {
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'include'
  });
  if (response.status !== 204) throw new Error('No se pudo cerrar la sesión. Inténtalo de nuevo.');
}
```
- Emite petición `POST` hacia `/api/v1/auth/logout`.
- Exige estrictamente que la respuesta tenga el código HTTP 204 No Content.
