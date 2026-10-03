# Componentes de Presentación (Dumb UI): Web Auth

[⬅️ Volver a la Documentación del Módulo](README.md) | [Siguiente: Hooks Headless y Estado ➡️](hooks.md)

---

## 1. Componente Presentacional Puro (`AuthControlsView`)

El componente `AuthControlsView` (`apps/web/src/features/auth/components/AuthControls.tsx:15-92`) es un componente puramente tonto (*Dumb Component*).

### 1.1 Sin llamadas de red imperativas
- **0 peticiones `fetch`**, **0 llamadas `WebSocket`** y **0 accesos a almacenamiento de red**.
- No contiene hooks de efecto ni estado mutable interno.
- Todo su comportamiento se define a través de las propiedades recibidas (`props`).
- El navegador sí realiza la carga declarativa del `<img>` contra el proxy del mismo origen; esta garantía se refiere a las llamadas imperativas del componente.

---

### 1.2 Interfaz de Props (`AuthControlsViewProps`)

Definida en `AuthControls.tsx:7-13`:
```typescript
interface AuthControlsViewProps {
  state: AuthState;
  signingOut?: boolean;
  logoutError?: boolean;
  onRetry: () => void;
  onLogout: () => void;
}
```

- `state` (*AuthState*): Unión discriminada que define el estado de la sesión (`'loading'`, `'anonymous'`, `'error'` o `{ status: 'authenticated', user }`).
- `signingOut` (*boolean, opcional, por defecto `false`*): Indica si el proceso de cierre de sesión está en curso para deshabilitar el botón y mostrar el texto `"Cerrando sesión…"`.
- `logoutError` (*boolean, opcional, por defecto `false`*): Indica si la petición de logout falló para mostrar la alerta correspondiente.
- `onRetry` (*() => void*): Callback accionado por el usuario para reintentar la comprobación de sesión.
- `onLogout` (*() => void*): Callback disparado al hacer clic en el botón de cerrar sesión.

---

### 1.3 Renderizado por Estados

El componente utiliza la unión discriminada de `state` para renderizar el fragmento accesible correspondiente:

1. **Estado de Carga (`status: 'loading'`):**
   ```tsx
   {state.status === 'loading' && <output className="auth-hint">Comprobando sesión…</output>}
   ```
2. **Estado Anónimo (`status: 'anonymous'`):**
   Renderiza un hipervínculo accesible con icono semántico hacia la ruta de autorización de Discord:
   ```tsx
   <a className="auth-button auth-login" href={discordLoginUrl}>
     Entrar con Discord <span aria-hidden="true">↗</span>
   </a>
   ```
3. **Estado Autenticado (`status: 'authenticated'`):**
   - **Avatar Inteligente:** Si `state.user.avatarHash` existe, construye `/api/v1/discord-avatars/{discordId}/{hash}` codificando ambos segmentos con `encodeURIComponent`. El [proxy del backend](../../api/auth/avatars.md) elige GIF o PNG y evita la conexión directa del navegador al CDN de Discord. Si no tiene avatar (`avatarHash === null`), renderiza un contenedor con las dos primeras iniciales en mayúsculas (`AuthControls.tsx:40-50`).
   - **Etiqueta de Rol:** Traduce los valores técnicos del enum a etiquetas de interfaz:
     - `'owner'` -> `"Owner"`
     - `'admin'` -> `"Administrador"`
     - `'viewer'` -> `"Miembro"`
   - **Botón de Logout:** Botón con estado deshabilitado durante el tránsito (`disabled={signingOut}`).
   - **Alerta de Error de Logout:** Si `logoutError === true`, muestra un mensaje con `role="alert"`.
4. **Estado de Error (`status: 'error'`):**
   Muestra un aviso con `role="alert"` (`"No se pudo comprobar tu sesión."`) y un botón para invocar `onRetry`.

---

## 2. Componente Conector (`AuthControls`)

En `apps/web/src/features/auth/components/AuthControls.tsx:94-108`, el componente `AuthControls` actúa como adaptador entre el contexto de React y la vista presentacional:

```tsx
export function AuthControls() {
  const { state, signingOut, logoutError, retry, logout } = useAuth();

  return (
    <AuthControlsView
      state={state}
      signingOut={signingOut}
      logoutError={logoutError}
      onRetry={retry}
      onLogout={() => {
        void logout();
      }}
    />
  );
}
```

---

## 3. Guardia Perimetral de Acceso (`RequireAdmin`)

El componente `RequireAdmin` (`apps/web/src/features/auth/components/RequireAdmin.tsx:5-34`) protege rutas y vistas restringidas a usuarios con roles administrativos (`'admin'` u `'owner'`):

```tsx
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { state, retry, signingOut } = useAuth();
  if (state.status === 'loading' || signingOut)
    return <output className="empty-state">Comprobando acceso…</output>;
  if (state.status === 'error')
    return (
      <div className="empty-state error-state" role="alert">
        <p>No se pudo comprobar tu sesión.</p>
        <button type="button" className="btn-ghost" onClick={retry}>
          Reintentar
        </button>
      </div>
    );
  if (state.status === 'anonymous')
    return (
      <div className="empty-state">
        <p>Inicia sesión para acceder a la administración.</p>
        <a className="btn-primary" href={discordLoginUrl}>
          Entrar con Discord
        </a>
      </div>
    );
  if (!canAccessAdmin(state))
    return (
      <p className="empty-state error-state" role="alert">
        No tienes permisos de administración.
      </p>
    );
  return <>{children}</>;
}
```

### Comportamiento Defensivo:
- **Cero Parpadeos (*No Flickering*):** Durante los estados transitorios (`'loading'` o `signingOut`), no renderiza ni monta los componentes hijos (`children`).
- **Enlace Directo de Autenticación:** Si el usuario es anónimo, muestra un botón directo para entrar con Discord.
- **Denegación Explícita:** Si el usuario está autenticado pero su rol es `'viewer'`, bloquea el acceso con un mensaje de alerta accesible.
