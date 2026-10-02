# Tipos y Contratos de Interfaz: Web Member Roles

[⬅️ Volver a Vistas Ensambladoras](pages.md) | [Siguiente: Índice de CRUD Operations API ➡️](../../api/crud-operations/README.md)

---

## 1. Contratos de Dominio Reexportados (`@rcl/contracts`)

El módulo web importa y utiliza los contratos de membresía de `@rcl/contracts` (`packages/contracts/src/member-roles.ts:1-18`):

### 1.1 `MemberRole`
```typescript
export type MemberRole = 'viewer' | 'admin' | 'owner';
```
Unión de literales de cadena que restringe los roles de acceso admisibles en el sistema.

### 1.2 `RoleMember`
```typescript
export interface RoleMember {
  discordId: string;
  username: string;
  globalName: string | null;
  role: MemberRole;
}
```
Estructura de datos que representa a un miembro en las tablas de la interfaz.

### 1.3 `MemberRolesPage`
```typescript
export interface MemberRolesPage {
  members: RoleMember[];
  hasMore: boolean;
}
```
Respuesta paginada devuelta por el backend con la lista de usuarios y el indicador de páginas posteriores.

### 1.4 `ChangeMemberRole`
```typescript
export interface ChangeMemberRole {
  role: MemberRole;
  expectedRole: MemberRole;
}
```
Payload transmitido al invocar `PATCH /api/v1/member-roles/:discordId` para garantizar concurrencia optimista.

---

## 2. Tipos de Estado y Componentes Locales

### 2.1 Estado de Mutación Pendiente (`ChangeState`)

Definido inline en `MemberRolesPanel.tsx:20`:
```typescript
type PendingChange = {
  member: RoleMember;
  role: MemberRole;
} | null;
```
Representa la intención de modificación seleccionada por el usuario antes de pulsar *"Confirmar cambio"* en el modal.

---

### 2.2 Propiedades de la Tabla (`MemberRolesTableProps`)

Definida en `MemberRolesPanel.tsx:211-219`:
```typescript
interface MemberRolesTableProps {
  members: RoleMember[];
  canManage: boolean;
  disabled: boolean;
  onChange: (member: RoleMember, role: MemberRole) => void;
}
```

- `members`: Conjunto de miembros a renderizar.
- `canManage`: Bandera que habilita o desactiva la columna interactiva de cambio de rol.
- `disabled`: Deshabilita los desplegables de rol cuando hay una operación de red en curso o una confirmación abierta.
- `onChange`: Callback tipado que notifica la selección de un rol para un miembro concreto.
