# Contratos y DTOs: Authentication API

[⬅️ Volver a Validación y Manejo de Errores](validation.md) | [Siguiente: Índice de Member Roles ➡️](../member-roles/README.md)

---

## 1. Contratos Compartidos (`@rcl/contracts`)

El contrato principal de identidad del usuario autenticado se exporta de forma centralizada en el paquete de contratos del monorepo (`packages/contracts/src/auth.ts:1-7`):

```typescript
export interface AuthUser {
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
  role: 'viewer' | 'admin' | 'owner';
}
```

### Campos de `AuthUser`:
- `discordId` (*string*): Snowflake numérico único de Discord (17 a 20 dígitos).
- `username` (*string*): Nombre de usuario primario en Discord (sin discriminador numérico).
- `globalName` (*string \| null*): Nombre público para mostrar configurado por el usuario en Discord. Puede ser `null` si no lo ha definido.
- `avatarHash` (*string \| null*): Hash identificador del recurso de avatar en los servidores CDN de Discord. Si el hash comienza con `a_`, representa un avatar animado (formato GIF). Es `null` si el usuario no tiene avatar personalizado.
- `role` (*'viewer' \| 'admin' \| 'owner'*): Rol de acceso y permisos en el sistema RCL-Next.

---

## 2. Contratos Internos del Módulo API

### 2.1 Configuración de Transporte (`AuthOptions`)

Definido en `apps/api/src/modules/auth/auth.router.ts:6-10`:
```typescript
export interface AuthOptions {
  service: AuthService;
  secureCookies: boolean;
  frontendOrigin: string;
}
```
- `service` (*AuthService*): Instancia del servicio de autenticación inyectada en el router.
- `secureCookies` (*boolean*): Si es `true`, activa las cookies con prefijo `__Host-` y la bandera `Secure: true`. Si es `false` (desarrollo local), utiliza nombres de cookie sin prefijo y `Secure: false`.
- `frontendOrigin` (*string*): Origen URL del frontend (ej. `http://localhost:5173` o `https://rcl.es`). Utilizado como destino fijo para las redirecciones OAuth2 y para la validación estricta de la cabecera `Origin` en `requireTrustedOrigin`.

### 2.2 Perfil de Discord Extraído (`DiscordProfile`)

Definido en `apps/api/src/modules/auth/auth.repository.ts:3-8`:
```typescript
export interface DiscordProfile {
  discordId: string;
  username: string;
  globalName: string | null;
  avatarHash: string | null;
}
```
Representa los datos sanitizados extraídos de la API de Discord antes de aplicar el upsert en la tabla `discord_users`. Nótese que esta interfaz **no contiene la propiedad `role`**, reafirmando que Discord no suministra permisos de aplicación.

### 2.3 Configuración del Cliente de Discord (`DiscordConfig`)

Definido en `apps/api/src/modules/auth/discord.client.ts:5-9`:
```typescript
export interface DiscordConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}
```

---

## 3. Contratos de Carga Útil HTTP (Wire DTOs)

### 3.1 Respuesta de `/api/v1/auth/me`

Envelope estándar de respuesta exitosa devuelto por la ruta de inspección de sesión:

```typescript
export interface AuthMeResponse {
  data: AuthUser;
}
```

**Ejemplo de Payload JSON:**
```json
{
  "data": {
    "discordId": "249823482394823492",
    "username": "rebel_captain",
    "globalName": "Captain Rebel",
    "avatarHash": "7b093284092834092834092834092834",
    "role": "admin"
  }
}
```

### 3.2 Formato Canónico de Respuestas de Error

Cualquier error devuelto por el módulo de autenticación sigue la estructura inmutable de `AppError`:

```typescript
export interface AuthErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
```

**Ejemplo de Error JSON (401 Unauthenticated):**
```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Sign-in is required."
  }
}
```
