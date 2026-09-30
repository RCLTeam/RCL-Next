# Lógica de Procesamiento y Gobernanza: Member Roles Engine

[⬅️ Volver a Rutas y Controladores](routes.md) | [Siguiente: Persistencia Relacional y Bloqueos ➡️](persistence.md)

---

## 1. Ciclo de Vida y Jerarquía de `appRole`

El sistema de roles de acceso a la plataforma está modelado en PostgreSQL mediante el enum `app_role` (`packages/database/src/schema.ts:24`): `'viewer'`, `'admin'`, `'owner'`.

```
                    +--------------------+
                    |       viewer       |  (Rol por defecto al registrarse)
                    +--------------------+
                              |
                   (Promovido por un owner)
                              v
                    +--------------------+
                    |       admin        |  (Acceso a panel de gestión y lectura)
                    +--------------------+
                              |
                   (Promovido por un owner)
                              v
                    +--------------------+
                    |       owner        |  (Control total y gestión de roles)
                    +--------------------+
```

### Definición de Privilegios por Nivel:
1. **`viewer` (Miembro / Lector):**
   - Asignado automáticamente a todo usuario que inicie sesión por primera vez con Discord (`discordUsers.role.default('viewer')`).
   - Acceso público a clasificaciones, calendarios, partidos, estadísticas de jugadores y predicciones.
   - Denegación estricta (HTTP 403) a cualquier ruta administrativa.
2. **`admin` (Administrador de Competición):**
   - Capacidad para acceder al panel de administración general (`/admin`).
   - Permiso de lectura sobre el censo de miembros (`GET /api/v1/member-roles`).
   - Gestión de contenidos editoriales (`home-content`), subida de repeticiones (`rofl-upload`) y operaciones CRUD sobre datos de la liga (`crud-operations`).
   - **Restricción:** No puede modificar roles de usuarios ni degradar a otros miembros.
3. **`owner` (Propietario del Sistema):**
   - Máximo nivel de autorización en RCL-Next.
   - Satisface todas las comprobaciones de `admin` implícitamente (`auth.router.ts:25-26`).
   - Autoridad exclusiva para ejecutar mutaciones de rol (`PATCH /api/v1/member-roles/:discordId`).
   - Autoridad exclusiva para restaurar e importar copias de seguridad de la base de datos (`database-transfer`).

---

## 2. Disociación de Dominios: Roles de Sistema frente a Roles de Roster

Para erradicar ambigüedades arquitectónicas, es imperativo contrastar la gobernanza de accesos frente a la gestión deportiva de plantillas:

> **Disociación de Roles de Sistema y Roster:**
> Aunque conceptualmente podría inferirse que el módulo `member-roles` gestiona los roles deportivos de los jugadores y sus traspasos entre equipos, en el código vivo:
>
> 1. `apps/api/src/modules/member-roles` gestiona **estricta y únicamente los roles de permisos del sistema** (`appRole`) en la tabla `discord_users`.
> 2. Los roles deportivos de plantilla (`rosterRole`: `'top'`, `'jungle'`, `'mid'`, `'adc'`, `'support'`, `'substitute'`, `'coach'`, `'staff'`, `'partners'`) pertenecen a la entidad `team_memberships` (`schema.ts:208-240`).
> 3. La condición de capitán (`isCaptain: boolean`) en `team_memberships` está regulada a nivel de base de datos por dos restricciones estrictas:
>    - Restricción CHECK `team_memberships_captain_role_check` (`schema.ts:230-233`):
>      ```sql
>      CHECK ("is_captain" = false OR "role" IN ('top', 'jungle', 'mid', 'adc', 'support'))
>      ```
>      Un capitán debe ser obligatoriamente un jugador activo de línea (queda vetada la capitanía para suplentes, entrenadores, staff o socios).
>    - Índice único parcial `team_memberships_unique_captain` (`schema.ts:236-239`):
>      ```sql
>      CREATE UNIQUE INDEX "team_memberships_unique_captain" ON "team_memberships" ("team_id") WHERE "is_captain" = true;
>      ```
>      Garantiza que un equipo no pueda tener más de un capitán simultáneamente.
> 4. Los movimientos y traspasos históricos en `roster_movements` (`schema.ts:242-275`) registran acciones del enum `roster_movement_action` (`'joined'`, `'left'`, `'promoted_to_captain'`, `'demoted_from_captain'`, `'role_changed'`). Estos movimientos se insertan automáticamente a través de `recordMovement()` en el módulo CRUD (`apps/api/src/modules/crud-operations/postgres-crud-operations.repository.ts:182-204`), **jamás a través del módulo `member-roles`**.

---

## 3. Bloqueo Optimista contra Condiciones de Carrera (`ROLE_CHANGED`)

En entornos multi-administrador, dos propietarios podrían visualizar la lista de miembros simultáneamente y decidir cambiar el rol del mismo usuario. Si no existiera control de concurrencia, una mutación sobreescribiría silenciosamente a la otra.

El servicio implementa un bloqueo optimista formal (`postgres-member-roles.repository.ts:52-53`):
```typescript
if (before.role !== change.expectedRole)
  throw new AppError(409, 'ROLE_CHANGED', 'This role changed. Reload the member list.');
```
- El cliente debe inspeccionar el estado actual del miembro y enviarlo explícitamente en el payload como `expectedRole`.
- Si el rol almacenado en PostgreSQL ya difiere de `expectedRole` al ejecutarse la transacción, se aborta la mutación y se devuelve HTTP 409 con el código `ROLE_CHANGED`, requiriendo que la interfaz recargue los datos antes de permitir un nuevo intento.

---

## 4. Protección Categórica del Último Propietario (`LAST_OWNER`)

Para prevenir que un error humano o una acción deliberada prive a la plataforma de cualquier administrador con permisos de propietario (dejando al sistema acéfalo), el repositorio evalúa la degradación bajo bloqueo exclusivo de tabla (`postgres-member-roles.repository.ts:55-67`):

```typescript
if (before.role === 'owner' && change.role !== 'owner') {
  const owners = await tx
    .select({ id: discordUsers.discordId })
    .from(discordUsers)
    .where(eq(discordUsers.role, 'owner'))
    .limit(2);
  if (owners.length < 2)
    throw new AppError(
      409,
      'LAST_OWNER',
      'The last owner cannot be demoted. Assign another owner first.'
    );
}
```

### Mecanismo de Salvaguarda:
1. **Detección de Degradación:** Se activa únicamente si el usuario objetivo es actualmente un `owner` (`before.role === 'owner'`) y el nuevo rol solicitado no lo es (`change.role !== 'owner'`).
2. **Cómputo Eficiente con `LIMIT 2`:** No realiza un costoso `COUNT(*)` sobre toda la tabla; consulta únicamente si existen al menos 2 propietarios.
3. **Bloqueo Incondicional:** Si `owners.length < 2`, la operación se cancela arrojando HTTP 409 `LAST_OWNER`. La única forma de degradar a un propietario es promocionar previamente a otro miembro como `owner`.

---

## 5. Gestión de Auto-Degradación

Un propietario tiene permitido auto-degradarse a `admin` o `viewer` siempre y cuando exista al menos otro propietario en el sistema.

Cuando esta mutación prospera:
1. El cambio se registra en `discord_users` y en `audit_logs` con `actorDiscordUserId` igual al propio miembro.
2. En el cliente web (`apps/web/src/features/member-roles/components/MemberRolesPanel.tsx:60-61`), se detecta que el `discordId` modificado coincide con el del usuario autenticado actual y se invoca de inmediato `refreshSession()`.
3. Esto sincroniza el estado global de React, invalidando los accesos privilegiados de la interfaz en tiempo real.
