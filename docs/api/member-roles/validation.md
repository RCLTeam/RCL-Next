# Validación y Reglas de Dominio: Member Roles API

[⬅️ Volver a Persistencia Relacional y Bloqueos](persistence.md) | [Siguiente: Contratos y DTOs ➡️](contracts.md)

---

## 1. Esquemas Zod de Validación Estricta

Todas las operaciones del servicio de roles (`apps/api/src/modules/member-roles/member-roles.service.ts:1-26`) se validan mediante esquemas Zod configurados con el modificador `.strict()`. Cualquier propiedad adicional o desconocida no contemplada en el esquema genera un rechazo inmediato por validación.

### 1.1 Validación de Parámetros de Consulta (`list`)

En `member-roles.service.ts:8-14`:
```typescript
list(query: unknown) {
  const input = z
    .object({
      search: z.string().trim().max(120).default(''),
      offset: z.coerce.number().int().min(0).max(1000000).default(0)
    })
    .strict()
    .parse(query);
  return this.repository.list(input.search, input.offset);
}
```

- `search`: Cadena de texto recortada en extremos con `trim()`. Longitud máxima de 120 caracteres. Si se omite, toma por defecto `""`.
- `offset`: Coerción numérica a entero con `z.coerce.number().int()`. Rango estricto entre `0` y `1.000.000`. Si se omite, toma por defecto `0`.
- `.strict()`: Rechaza cualquier parámetro extraño en la URL (ej. `?search=rebel&inject=hack`), devolviendo un error HTTP 422.

---

### 1.2 Validación de Mutación de Rol (`changeRole`)

En `member-roles.service.ts:4, 17-24`:
```typescript
const role = z.enum(['viewer', 'admin', 'owner']);

changeRole(actorId: string, memberId: unknown, body: unknown) {
  const id = z
    .string()
    .regex(/^\d{17,20}$/)
    .parse(memberId);
  const input = z.object({ role, expectedRole: role }).strict().parse(body);
  return this.repository.changeRole(actorId, id, input);
}
```

- `memberId` (Parámetro de Ruta): Se valida como cadena que cumpla con el formato Snowflake de Discord (`/^\d{17,20}$/`). Impide que valores arbitrarios, alfanuméricos o UUIDs alcancen la consulta SQL.
- `body.role`: Debe ser exactamente uno de los tres valores permitidos: `'viewer'`, `'admin'` u `'owner'`.
- `body.expectedRole`: Debe pertenecer al mismo enum de roles, exigiendo que el cliente declare explícitamente el rol que el miembro ostentaba en la última lectura.
- `.strict()`: Prohíbe propiedades adicionales en el cuerpo JSON de la petición.

---

## 2. Catálogo de Errores y Matriz de Códigos HTTP

El enrutador y repositorio traducen las anomalías a instancias de `AppError` formateadas como `{ error: { code: string, message: string } }`:

| Código HTTP | Código Canónico (`error.code`) | Mensaje Emitido | Causa y Condición |
|:---:|---|---|---|
| `401 Unauthorized` | `UNAUTHENTICATED` | `"Sign-in is required."` | Petición sin cookie de sesión activa o con sesión caducada. |
| `403 Forbidden` | `FORBIDDEN` | `"Only an owner can manage member roles."` o `"Insufficient permissions."` | El usuario solicitante posee rol `'viewer'` (en lectura) o rol `'admin'` (en mutación). |
| `403 Forbidden` | `INVALID_ORIGIN` | `"Request origin is not allowed."` | La cabecera `Origin` en peticiones PATCH difiere de `frontendOrigin`. |
| `404 Not Found` | `NOT_FOUND` | `"Member was not found."` | No existe ningún registro en `discord_users` con el `discordId` indicado. |
| `409 Conflict` | `ROLE_CHANGED` | `"This role changed. Reload the member list."` | Violación de concurrencia optimista: `before.role !== change.expectedRole`. |
| `409 Conflict` | `LAST_OWNER` | `"The last owner cannot be demoted. Assign another owner first."` | Intento de degradar al único usuario con rol `'owner'` registrado en el sistema. |
| `422 Unprocessable Entity` | `VALIDATION_ERROR` | Descripción detallada de Zod | Snowflake de Discord no numérico, rol fuera del enum, o campos desconocidos por `.strict()`. |
