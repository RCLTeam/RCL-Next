# Tipos y Contratos de Interfaz: Web Auth

[⬅️ Volver a Integración en Páginas](pages.md) | [Siguiente: Índice de Web Member Roles ➡️](../member-roles/README.md)

---

## 1. Unión Discriminada del Estado de Sesión (`AuthState`)

Definida en `apps/web/src/features/auth/components/AuthProvider.tsx:5-7`:

```typescript
export type AuthState =
  | { status: 'loading' | 'anonymous' | 'error' }
  | { status: 'authenticated'; user: AuthUser };
```

### Variantes de Estado:
- `{ status: 'loading' }`: Petición de comprobación de sesión en vuelo hacia `/api/v1/auth/me`.
- `{ status: 'anonymous' }`: Usuario no autenticado o sesión expirada (respuesta HTTP 401).
- `{ status: 'error' }`: Fallo de conexión de red o error de servidor al intentar validar la sesión.
- `{ status: 'authenticated', user: AuthUser }`: Sesión válida confirmada. Garantiza la presencia del objeto tipado `user`.

---

## 2. Interfaz del Contexto de Sesión (`AuthSession`)

Definida en `AuthProvider.tsx:9-15`:

```typescript
interface AuthSession {
  state: AuthState;
  signingOut: boolean;
  logoutError: boolean;
  retry: () => void;
  logout: () => Promise<void>;
}
```

- `state`: Unión discriminada con el estado actual de la sesión.
- `signingOut`: `true` mientras la petición `POST /api/v1/auth/logout` está en ejecución.
- `logoutError`: `true` si la petición de logout fue rechazada o falló la conexión.
- `retry`: Función que incrementa el contador de reintentos para lanzar una nueva consulta cancelable de sesión.
- `logout`: Función que orquesta la revocación de la sesión en el servidor y conmuta el estado local a `'anonymous'`.

---

## 3. Propiedades del Componente Presentacional (`AuthControlsViewProps`)

Definida en `apps/web/src/features/auth/components/AuthControls.tsx:9-15`:

```typescript
interface AuthControlsViewProps {
  state: AuthState;
  signingOut?: boolean;
  logoutError?: boolean;
  onRetry: () => void;
  onLogout: () => void;
}
```

Contrato estricto de propiedades para la vista pura de controles de cuenta en la cabecera.

---

## 4. Reexportación de Contratos de Dominio

El módulo Web consume y reexporta el contrato de usuario autenticado de `@rcl/contracts`:

```typescript
import type { AuthUser } from '@rcl/contracts';
```
Garantizando que cualquier cambio en las propiedades del usuario (`discordId`, `username`, `globalName`, `avatarHash`, `role`) se propague de forma asistida por el compilador de TypeScript tanto en el backend como en el frontend.
