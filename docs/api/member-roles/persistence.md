# Persistencia Relacional y Concurrencia: Member Roles Repository

[⬅️ Volver a Lógica de Procesamiento](processing.md) | [Siguiente: Validación y Reglas de Dominio ➡️](validation.md)

---

## 1. Implementación del Repositorio (`PostgresMemberRolesRepository`)

La persistencia de roles y la pista de auditoría se implementan en `PostgresMemberRolesRepository` (`apps/api/src/modules/member-roles/postgres-member-roles.repository.ts:15-84`), interactuando con las tablas `discord_users` y `audit_logs`.

La proyección SQL estándar de miembros reutilizada en todas las consultas (`postgres-member-roles.repository.ts:9-14`) es:
```typescript
const selection = {
  discordId: discordUsers.discordId,
  username: discordUsers.username,
  globalName: discordUsers.globalName,
  role: discordUsers.role
};
```

---

## 2. Búsqueda Paginada de Miembros (`list`)

La consulta de listado (`postgres-member-roles.repository.ts:17-35`) resuelve la auditoría de usuarios con sanitización textual:

```typescript
async list(search: string, offset: number) {
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await this.db
    .select(selection)
    .from(discordUsers)
    .where(
      search
        ? or(
            ilike(discordUsers.username, pattern),
            ilike(discordUsers.globalName, pattern),
            ilike(discordUsers.discordId, pattern)
          )
        : undefined
    )
    .orderBy(asc(discordUsers.username), asc(discordUsers.discordId))
    .limit(51)
    .offset(offset);
  return { members: rows.slice(0, 50), hasMore: rows.length > 50 };
}
```

### Características Técnicas:
1. **Escape de Comodines SQL:** La expresión `search.replace(/[\\%_]/g, '\\$&')` neutraliza caracteres comodín de SQL (`%` y `_`), impidiendo que entradas del usuario alteren el patrón de coincidencia.
2. **Comparación Insensible a Mayúsculas (`ILIKE`):** Evalúa concurrentemente si el patrón coincide con el nombre de usuario (`username`), nombre global (`globalName`) o identificador Snowflake (`discordId`).
3. **Orden Determinista:** `orderBy(asc(username), asc(discordId))` garantiza una paginación estable sin saltos ni duplicaciones entre páginas.
4. **Detección Eficiente de Paginación (*Limit 51*):** Solicita 51 registros para una página de 50. Si `rows.length > 50`, deduce que existe una página subsiguiente (`hasMore = true`) y recorta la respuesta a 50 elementos (`rows.slice(0, 50)`), evitando emitir una consulta separada de conteo total (`COUNT(*)`).

---

## 3. Mutación Transaccional con Bloqueo de Tabla (`changeRole`)

La actualización de privilegios (`postgres-member-roles.repository.ts:36-83`) ejecuta una secuencia de 8 pasos dentro de `this.db.transaction`:

```typescript
async changeRole(actorId: string, memberId: string, change: ChangeMemberRole) {
  return this.db.transaction(async (tx) => {
    // Role changes are rare. Serialize writes, including concurrent owner demotions,
    // and recheck the actor within the same transaction as the update and audit.
    await tx.execute(sql`LOCK TABLE ${discordUsers} IN SHARE ROW EXCLUSIVE MODE`);
    const [actor] = await tx
      .select(selection)
      .from(discordUsers)
      .where(eq(discordUsers.discordId, actorId));
    if (actor?.role !== 'owner')
      throw new AppError(403, 'FORBIDDEN', 'Only an owner can manage member roles.');
    const [before] = await tx
      .select(selection)
      .from(discordUsers)
      .where(eq(discordUsers.discordId, memberId));
    if (!before) throw notFound('Member');
    if (before.role !== change.expectedRole)
      throw new AppError(409, 'ROLE_CHANGED', 'This role changed. Reload the member list.');
    if (before.role === change.role) return before;
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
    const [after] = await tx
      .update(discordUsers)
      .set({ role: change.role })
      .where(eq(discordUsers.discordId, memberId))
      .returning(selection);
    if (!after) throw notFound('Member');
    await tx.insert(auditLogs).values({
      actorDiscordUserId: actorId,
      action: 'member-roles.update',
      entityType: 'discord_users',
      before,
      after
    });
    return after;
  });
}
```

### Análisis Forense de los Pasos:

1. **Bloqueo `SHARE ROW EXCLUSIVE MODE` (`line 40`):**
   - Las mutaciones de roles son eventos poco frecuentes pero de altísimo impacto de seguridad.
   - Este modo de bloqueo impide que cualquier otra transacción concurrente adquiera bloqueos de escritura (`SHARE ROW EXCLUSIVE`, `EXCLUSIVE` o `ACCESS EXCLUSIVE`) sobre `discord_users`.
   - **No bloquea lecturas estándar (`SELECT`)**: las consultas públicas de lectura continúan ejecutándose sin latencia.
   - Serializa rigurosamente todas las mutaciones de permisos concurrentes.
2. **Re-verificación de Privilegios del Actor bajo el Bloqueo (`lines 41-46`):**
   Si dos transacciones intentaran degradarse mutuamente, la segunda esperará al bloqueo de la primera. Una vez adquirido, lee su propio estado fresco de la base de datos. Si la primera transacción le retiró el rol `'owner'`, la comprobación `actor?.role !== 'owner'` saltará y arrojará HTTP 403 `FORBIDDEN`.
3. **Existencia del Miembro Objetivo (`lines 47-51`):**
   Si el miembro especificado en `memberId` no existe en `discord_users`, lanza `AppError(404, 'NOT_FOUND', 'Member was not found.')`.
4. **Verificación de Bloqueo Optimista (`lines 52-53`):**
   Compara `before.role` con `change.expectedRole`. Si difieren, lanza HTTP 409 `ROLE_CHANGED`.
5. **No-op Idempotente (`line 54`):**
   Si el rol actual coincide con el nuevo rol solicitado, devuelve `before` sin escribir en disco ni registrar auditorías redundantes.
6. **Protección del Último Propietario (`lines 55-67`):**
   Si se degrada a un propietario, cuenta si existen al menos 2 registros con rol `'owner'`. Si `owners.length < 2`, lanza HTTP 409 `LAST_OWNER`.
7. **Actualización Relacional (`lines 68-73`):**
   Aplica `UPDATE discord_users SET role = $1 WHERE discord_id = $2 RETURNING ...`.
8. **Inserción Inmutable en `audit_logs` (`lines 74-80`):**
   Inserta un registro con `action: 'member-roles.update'`, `entityType: 'discord_users'`, registrando el estado previo (`before`) y posterior (`after`) como documentos JSONB.

---

## 4. Esquema de Pista de Auditoría (`audit_logs`)

Definida en `packages/database/src/schema.ts:85-107`:

| Columna | Tipo SQL | Descripción |
|---|---|---|
| `id` | `uuid` (DEFAULT `gen_random_uuid()`) | Clave primaria única del evento de auditoría. |
| `actor_discord_user_id` | `varchar(32)` | Clave foránea hacia `discord_users.discord_id` (`ON DELETE SET NULL`). |
| `action` | `varchar(120)` | Identificador semántico de la acción ejecutada (`'member-roles.update'`). |
| `entity_type` | `varchar(64)` | Entidad relacional afectada (`'discord_users'`). |
| `entity_id` | `uuid` (nullable) | Identificador UUID de la entidad (nulo en usuarios, cuyo identificador es Snowflake). |
| `before` | `jsonb` | Snapshot JSON del estado anterior del miembro (`RoleMember`). |
| `after` | `jsonb` | Snapshot JSON del estado resultante del miembro (`RoleMember`). |
| `created_at` | `timestamptz` | Marca temporal inmutable del momento del cambio. |
| `updated_at` | `timestamptz` | Marca temporal de actualización. |
