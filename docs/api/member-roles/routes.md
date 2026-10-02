# Rutas y Controladores: Member Roles API

[⬅️ Volver a la Documentación del Módulo](README.md) | [Siguiente: Lógica de Procesamiento ➡️](processing.md)

---

## 1. Resumen de la Capa de Transporte

El enrutador de roles de miembros (`apps/api/src/modules/member-roles/member-roles.router.ts:5-28`) se monta bajo el prefijo `/api/v1/member-roles`. Expone la interfaz HTTP para auditar la relación de usuarios de la plataforma y modificar sus roles de acceso al sistema (`appRole`).

Todas las rutas inyectan de forma homogénea la cabecera HTTP defensiva (`member-roles.router.ts:7-10`):
- `Cache-Control: no-store`: Evita que intermediarios de red o el navegador almacenen datos de privilegios de usuario en caché.

---

## 2. Catálogo de Endpoints

### 2.1 Listar Miembros y Roles

- **Ruta:** `GET /api/v1/member-roles`
- **Controlador:** `member-roles.router.ts:11-13`
- **Autenticación requerida:** Rol `'admin'` o superior (`requireAuth(auth, 'admin')`). Un usuario con rol `'owner'` satisface este requisito; un `'viewer'` es denegado con 403.
- **Parámetros de consulta (Query Parameters):**
  - `search` (*string, opcional, por defecto `""`*): Cadena de texto para filtrar miembros. Se somete a `trim()` y se limita a un máximo de 120 caracteres (`member-roles.service.ts:10`).
  - `offset` (*entero, opcional, por defecto `0`*): Número de registros a omitir para paginación (`0 <= offset <= 1000000`).
- **Respuesta (HTTP 200 OK):**
  ```json
  {
    "data": {
      "members": [
        {
          "discordId": "194820938402938401",
          "username": "alex_mid",
          "globalName": "Alex",
          "role": "admin"
        },
        {
          "discordId": "209384092834092834",
          "username": "rebel_owner",
          "globalName": "Rebel Chief",
          "role": "owner"
        }
      ],
      "hasMore": false
    }
  }
  ```
- **Códigos de Estado:**
  - `200 OK`: Petición procesada con éxito.
  - `401 Unauthorized` (`UNAUTHENTICATED`): Sin sesión activa.
  - `403 Forbidden` (`FORBIDDEN`): El usuario no posee privilegios de administración (`viewer`).
  - `422 Unprocessable Entity` (`VALIDATION_ERROR`): Parámetros de query inválidos (longitud mayor a 120, offset negativo o no numérico).

---

### 2.2 Modificar Rol de un Miembro

- **Ruta:** `PATCH /api/v1/member-roles/:discordId`
- **Controlador:** `member-roles.router.ts:14-26`
- **Autenticación requerida:**
  1. `requireTrustedOrigin(auth.frontendOrigin)` (`auth.router.ts:33-40`): Exige que la cabecera `Origin` sea idéntica al origen del frontend autorizado para neutralizar ataques CSRF.
  2. `requireAuth(auth, 'owner')` (`auth.router.ts:22-30`): **Exclusivo para propietarios**. Un administrador (`admin`) no tiene permisos para otorgar, retirar ni modificar roles de miembros.
- **Parámetros de ruta:**
  - `discordId` (*string*): Snowflake de Discord del miembro a actualizar. Debe cumplir `/^\d{17,20}$/` (`member-roles.service.ts:18-21`).
- **Cuerpo de la Petición (JSON Body):**
  ```json
  {
    "role": "admin",
    "expectedRole": "viewer"
  }
  ```
- **Comportamiento:**
  1. Extrae el identificador del usuario que ejecuta la petición: `actorId = String(res.locals.user.discordId)` (`member-roles.router.ts:20`).
  2. Valida mediante Zod que `role` y `expectedRole` pertenezcan al enum `['viewer', 'admin', 'owner']` (`member-roles.service.ts:22`).
  3. Ejecuta la mutación atómica en `service.changeRole(actorId, id, input)`.
  4. Responde con el objeto `RoleMember` actualizado.
- **Respuesta (HTTP 200 OK):**
  ```json
  {
    "data": {
      "discordId": "194820938402938401",
      "username": "alex_mid",
      "globalName": "Alex",
      "role": "admin"
    }
  }
  ```
- **Códigos de Estado:**
  - `200 OK`: Rol actualizado con éxito (o no-op idempotente si el rol no varió).
  - `401 Unauthorized` (`UNAUTHENTICATED`): Sesión ausente o inválida.
  - `403 Forbidden` (`INVALID_ORIGIN`): Cabecera `Origin` no confiable.
  - `403 Forbidden` (`FORBIDDEN`): El solicitante no es propietario (`owner`).
  - `404 Not Found` (`NOT_FOUND`): El miembro con `discordId` indicado no existe en `discord_users`.
  - `409 Conflict` (`ROLE_CHANGED`): El rol del miembro en la base de datos no coincide con `expectedRole` (mutación concurrente).
  - `409 Conflict` (`LAST_OWNER`): Intento de degradar al único propietario restante del sistema.
  - `422 Unprocessable Entity` (`VALIDATION_ERROR`): Identificador `discordId` o cuerpo JSON malformado.
