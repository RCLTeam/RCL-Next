# Contratos y DTOs: Member Roles API

[⬅️ Volver a Validación y Reglas de Dominio](validation.md) | [Siguiente: Módulo Web Auth ➡️](../../web/auth/README.md)

---

## 1. Contratos Compartidos (`@rcl/contracts`)

Las interfaces y tipos que modelan la membresía y los roles de usuario se encuentran centralizadas en `packages/contracts/src/member-roles.ts:1-18`:

### 1.1 Tipo de Rol de Miembro (`MemberRole`)

```typescript
export type MemberRole = AuthUser['role']; // 'viewer' | 'admin' | 'owner'
```
Reutiliza directamente la definición del contrato de autenticación `AuthUser['role']`, garantizando consistencia en todo el monorepo.

---

### 1.2 Entidad de Miembro (`RoleMember`)

```typescript
export interface RoleMember {
  discordId: string;
  username: string;
  globalName: string | null;
  role: MemberRole;
}
```

- `discordId` (*string*): Snowflake único de Discord.
- `username` (*string*): Nombre de usuario primario en Discord.
- `globalName` (*string \| null*): Nombre público para mostrar, o `null` si no está configurado.
- `role` (*MemberRole*): Nivel de acceso asignado (`'viewer'`, `'admin'` u `'owner'`).

---

### 1.3 Página Paginada de Miembros (`MemberRolesPage`)

```typescript
export interface MemberRolesPage {
  members: RoleMember[];
  hasMore: boolean;
}
```

- `members` (*RoleMember[]*): Lista de miembros de la página actual (hasta 50 elementos).
- `hasMore` (*boolean*): Bandera que indica si existen más registros en las páginas siguientes para controlar la paginación.

---

### 1.4 Comando de Mutación de Rol (`ChangeMemberRole`)

```typescript
export interface ChangeMemberRole {
  role: MemberRole;
  expectedRole: MemberRole;
}
```

- `role` (*MemberRole*): Nuevo rol que se desea otorgar al miembro.
- `expectedRole` (*MemberRole*): Rol que el miembro ostenta actualmente, necesario para verificar el bloqueo optimista anti-carreras.

---

## 2. Contratos de Comunicación HTTP (Wire DTOs)

### 2.1 Respuesta de Listado (`GET /api/v1/member-roles`)

Envelope JSON devuelto por la ruta de consulta:
```json
{
  "data": {
    "members": [
      {
        "discordId": "249823482394823492",
        "username": "rebel_staff",
        "globalName": "Staff Lead",
        "role": "admin"
      }
    ],
    "hasMore": false
  }
}
```

---

### 2.2 Petición y Respuesta de Mutación (`PATCH /api/v1/member-roles/:discordId`)

- **Payload de Petición:**
  ```json
  {
    "role": "owner",
    "expectedRole": "admin"
  }
  ```
- **Envelope de Respuesta Exitosa (HTTP 200 OK):**
  ```json
  {
    "data": {
      "discordId": "249823482394823492",
      "username": "rebel_staff",
      "globalName": "Staff Lead",
      "role": "owner"
    }
  }
  ```
