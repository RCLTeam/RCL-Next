# Persistencia Relacional: Repositorio de Autenticación y Sesiones

[⬅️ Volver a Lógica de Procesamiento](processing.md) | [Siguiente: Validación y Manejo de Errores ➡️](validation.md)

---

## 1. Esquema Relacional de Autenticación

El almacenamiento del subsistema de autenticación se gestiona en PostgreSQL mediante Drizzle ORM sobre tres tablas definidas en `packages/database/src/schema.ts:53-84`:

```
+-----------------------------------+         +--------------------------------------+
|            oauth_states           |         |            discord_users             |
+-----------------------------------+         +--------------------------------------+
| token_hash: varchar(64) [PK]      |         | discord_id: varchar(32) [PK]         |
| expires_at: timestamp with tz     |         | username: varchar(64)                |
+-----------------------------------+         | global_name: varchar(64) [nullable]  |
                  |                           | avatar_hash: varchar(128) [nullable] |
                  |                           | role: app_role ('viewer'|'admin'...) |
                  |                           | created_at: timestamp with tz        |
                  |                           | updated_at: timestamp with tz        |
                  |                           +--------------------------------------+
                  |                                              ^
                  |                                              | 1:N (ON DELETE CASCADE)
                  |                           +--------------------------------------+
                  |                           |            auth_sessions             |
                  |                           +--------------------------------------+
                  |                           | token_hash: varchar(64) [PK]         |
                  +-------------------------->| discord_user_id: varchar(32) [FK]    |
                                              | expires_at: timestamp with tz        |
                                              | created_at: timestamp with tz        |
                                              +--------------------------------------+
```

### Índices de Rendimiento:
- `auth_sessions_expires_at_idx` (`schema.ts:73`): Acelera la discriminación de sesiones vigentes (`expires_at > now`) y las operaciones de purga en lote (`deleteExpired`).
- `oauth_states_expires_at_idx` (`schema.ts:82`): Optimiza la verificación de estados no caducados y su limpieza periódica.

---

## 2. Implementación de `PostgresAuthRepository`

La clase `PostgresAuthRepository` (`apps/api/src/modules/auth/postgres-auth.repository.ts:7-74`) implementa el contrato `AuthRepository` (`auth.repository.ts:10-22`).

### 2.1 Almacenamiento y Consumo Atómico de Estados OAuth

- **Guardar Estado (`saveState`):**
  ```typescript
  async saveState(tokenHash: string, expiresAt: Date) {
    await this.db.insert(oauthStates).values({ tokenHash, expiresAt });
  }
  ```
  Inserta el hash SHA-256 del estado generado junto con su marca de expiración (`now + 10 minutos`).

- **Consumo Atómico de Uso Único (`consumeState`):**
  ```typescript
  async consumeState(tokenHash: string, now: Date) {
    const rows = await this.db
      .delete(oauthStates)
      .where(and(eq(oauthStates.tokenHash, tokenHash), gt(oauthStates.expiresAt, now)))
      .returning({ tokenHash: oauthStates.tokenHash });
    return rows.length === 1;
  }
  ```
  **Garantía ACID de Uso Único:** Al emplear `DELETE ... RETURNING` condicionado a `expiresAt > now`, la base de datos elimina el registro y verifica su validez temporal en una sola operación atómica. Si dos peticiones simultáneas intentan validar el mismo estado, solo una de ellas recibirá la fila eliminada (`rows.length === 1`), mientras que la concurrente obtendrá `rows.length === 0` y será rechazada de inmediato.

---

### 2.2 Transacción de Creación y Rotación de Sesión (`createSession`)

La persistencia de una nueva sesión (`postgres-auth.repository.ts:22-48`) envuelve todas sus operaciones dentro de una transacción ACID `this.db.transaction`:

```typescript
async createSession(
  profile: DiscordProfile,
  tokenHash: string,
  expiresAt: Date,
  previousHash?: string
) {
  await this.db.transaction(async (tx) => {
    await tx
      .insert(discordUsers)
      .values(profile)
      .onConflictDoUpdate({
        target: discordUsers.discordId,
        // OAuth only updates profile data. Application roles are managed separately.
        set: {
          username: profile.username,
          globalName: profile.globalName,
          avatarHash: profile.avatarHash,
          updatedAt: new Date()
        }
      });
    if (previousHash)
      await tx.delete(authSessions).where(eq(authSessions.tokenHash, previousHash));
    await tx
      .insert(authSessions)
      .values({ tokenHash, discordUserId: profile.discordId, expiresAt });
  });
}
```

#### Aspectos Críticos de Seguridad en la Transacción:
1. **Preservación Incondicional de Roles (`onConflictDoUpdate`):**
   Al realizar el `UPSERT` del perfil del usuario, la cláusula `set` actualiza exclusivamente `username`, `globalName`, `avatarHash` y `updatedAt`. **Queda excluida deliberadamente la columna `role`**. Si un administrador o propietario inicia sesión de nuevo a través de Discord, sus permisos del sistema no se degradan a `'viewer'` (el valor por defecto de la columna).
2. **Rotación Transaccional:**
   Si se especificó `previousHash` (proveniente de la cookie de sesión que el usuario ya tenía activa), se elimina en `authSessions` dentro del mismo bloque transaccional. Esto previene la existencia de sesiones duplicadas para un mismo agente de usuario.
3. **Persistencia del Hash de Sesión:**
   Se almacena `tokenHash` con su clave foránea hacia `discordUserId` y la fecha de expiración calculada a 7 días.

---

### 2.3 Búsqueda de Usuario Activo (`findUser`)

Para resolver el usuario autenticado en cada petición entrante (`postgres-auth.repository.ts:50-64`):

```typescript
async findUser(tokenHash: string, now: Date) {
  const rows = await this.db
    .select({
      discordId: discordUsers.discordId,
      username: discordUsers.username,
      globalName: discordUsers.globalName,
      avatarHash: discordUsers.avatarHash,
      role: discordUsers.role
    })
    .from(authSessions)
    .innerJoin(discordUsers, eq(authSessions.discordUserId, discordUsers.discordId))
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, now)))
    .limit(1);
  return rows[0];
}
```

- Realiza un `INNER JOIN` directo entre `auth_sessions` y `discord_users`.
- Filtra por el hash SHA-256 de la sesión y asegura que `expires_at > now`.
- Retorna exactamente las propiedades requeridas por el contrato `AuthUser` (`discordId`, `username`, `globalName`, `avatarHash`, `role`).

---

### 2.4 Purga de Registros Caducados (`deleteExpired`)

Para evitar el crecimiento indefinido del almacenamiento de sesiones huérfanas o intentos de inicio de sesión inconclusos (`postgres-auth.repository.ts:70-73`):
```typescript
async deleteExpired(now: Date) {
  await this.db.delete(oauthStates).where(lte(oauthStates.expiresAt, now));
  await this.db.delete(authSessions).where(lte(authSessions.expiresAt, now));
}
```
Esta función se invoca de manera reactiva cada vez que un usuario comienza un flujo de autenticación (`AuthService.start`), purgando tuplas donde `expires_at <= now`.
