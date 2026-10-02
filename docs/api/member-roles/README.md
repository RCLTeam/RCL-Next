# Módulo API: Member Roles Governance & System Access

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: Web Auth ➡️](../../../docs/web/auth/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/member-roles/` implementa el subsistema de gobernanza de miembros, autorización y administración de privilegios de acceso al sistema en RCL-Next. Proporciona a los administradores y propietarios herramientas seguras para auditar la base de usuarios registrados y modificar quirúrgicamente los roles de aplicación (`appRole`: `'viewer'`, `'admin'`, `'owner'`) sobre la tabla relacional `discord_users`.

El módulo opera bajo cinco pilares arquitectónicos y de integridad:
1. **Disociación Estricta de Dominios de Roles:** El módulo gestiona **exclusivamente los roles de permisos del sistema** (`appRole`) en `discord_users`. No administra ni muta roles de plantilla deportiva (`rosterRole`: top, jungle, mid, adc, support, substitute, coach, staff, partners), capitanías en `team_memberships`, ni movimientos en `roster_movements`, los cuales son gestionados por el módulo CRUD (`apps/api/src/modules/crud-operations/postgres-crud-operations.repository.ts:182-204`).
2. **Serialización Transaccional contra Condiciones de Carrera:** Para evitar escaladas simultáneas de privilegios o que dos operaciones concurrentes de degradación de propietarios dejen al sistema acéfalo, la mutación adquiere un bloqueo exclusivo sobre la tabla de usuarios: `LOCK TABLE discord_users IN SHARE ROW EXCLUSIVE MODE` (`postgres-member-roles.repository.ts:40`).
3. **Protección Categórica del Último Propietario (`LAST_OWNER`):** Ninguna degradación de rol sobre un usuario con rango `'owner'` puede prosperar si no existen al menos otros propietarios adicionales activos (`owners.length < 2`, `postgres-member-roles.repository.ts:55-67`), retornando un rechazo HTTP 409 `LAST_OWNER`.
4. **Control de Concurrencia Optimista (`ROLE_CHANGED`):** El cliente debe enviar el rol esperado antes de la mutación (`expectedRole`). Si el estado en base de datos ya difiere del esperado por una mutación concurrente, la transacción aborta con HTTP 409 `ROLE_CHANGED` (`postgres-member-roles.repository.ts:52-53`).
5. **Pista de Auditoría Inmutable (Audit Trail):** Toda alteración de roles registra de manera obligatoria y dentro de la misma transacción relacional un evento en `audit_logs` (`postgres-member-roles.repository.ts:74-80`), preservando los estados JSONB `before` y `after` junto al identificador del actor.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Rutas y Controladores** | [routes.md](routes.md) | Endpoints de consulta (`GET /`) protegidos por rol `'admin'` y mutación (`PATCH /:discordId`) protegidos por rol `'owner'` y verificación de origen confiable. |
| **Lógica de Procesamiento y Gobernanza** | [processing.md](processing.md) | Ciclo de vida de `appRole`, disociación frente a `rosterRole`, concurrencia optimista, protección del último propietario y manejo de auto-degradación. |
| **Persistencia Relacional y Bloqueos** | [persistence.md](persistence.md) | Repositorio `PostgresMemberRolesRepository`, búsqueda ILIKE paginada, serialización de tabla `SHARE ROW EXCLUSIVE` y registro inmutable en `audit_logs`. |
| **Validación y Reglas de Dominio** | [validation.md](validation.md) | Esquemas Zod con modificador `.strict()`, validación de identificador Snowflake de Discord (`/^\d{17,20}$/`), reglas fail-fast y matriz de códigos de error. |
| **Contratos y DTOs** | [contracts.md](contracts.md) | Tipos y contratos TypeScript (`RoleMember`, `MemberRolesPage`, `ChangeMemberRole`, `MemberRole`). |

---

## 3. Garantías de Fiabilidad y Reglas de Dominio

- **Re-verificación de Privilegios del Actor bajo Bloqueo:** El rol del usuario solicitante no se confía ciegamente al middleware HTTP inicial; se vuelve a consultar en la base de datos dentro de la transacción serializada tras haber adquirido el bloqueo de tabla (`postgres-member-roles.repository.ts:41-46`). Si el actor fue degradado por una transacción paralela previa, la operación se aborta con HTTP 403 `FORBIDDEN`.
- **Idempotencia Transaccional:** Si una petición de cambio solicita exactamente el rol que el miembro ya posee (`before.role === change.role`), el repositorio omite escrituras en disco y no genera registros de auditoría redundantes (`postgres-member-roles.repository.ts:54`).
- **Búsqueda Insensible a Mayúsculas y Caracteres Especiales:** La búsqueda textual en `list()` escapa caracteres comodín de SQL (`\`, `%`, `_`) y ejecuta comparaciones `ILIKE` sobre `username`, `global_name` y `discord_id` (`postgres-member-roles.repository.ts:18, 24-28`).
