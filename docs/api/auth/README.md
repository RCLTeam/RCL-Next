# Módulo API: Authentication & Session Security

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: API Member Roles ➡️](../../../docs/api/member-roles/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/auth/` implementa el subsistema de autenticación federada, gestión de sesiones y seguridad criptográfica de RCL-Next. Integra el protocolo de autorización OAuth2 de Discord con un ciclo de vida de sesiones persistido en PostgreSQL bajo Drizzle ORM, aplicando defensas en profundidad frente a ataques de sombreo de cookies (*cookie shadowing*), redirecciones abiertas (*open redirect*), falsificación de peticiones en sitios cruzados (CSRF) y ataques de canal lateral basados en temporización (*timing attacks*).

El módulo opera bajo cinco pilares arquitectónicos y de seguridad:
1. **Defensa Criptográfica Adversarial:** Validación de estados OAuth en tiempo constante con `crypto.timingSafeEqual` (`auth.service.ts:38`), precedida obligatoriamente por una verificación estricta de longitud en bytes para prevenir excepciones de tiempo de ejecución no controladas.
2. **Tokens Opacos y Criptografía en Reposo:** Todos los identificadores de estado y tokens de sesión emitidos hacia el cliente se generan como secuencias aleatorias seguras de 32 bytes (`randomBytes(32).toString('hex')`, `auth.service.ts:23, 51`). En PostgreSQL, **los tokens en crudo jamás se persisten**; se almacenan exclusivamente sus resúmenes criptográficos SHA-256 (`auth.service.ts:11, 24, 54`).
3. **Cookies Aisladas con Prefijo `__Host-` y Restricción de Origen:** En entornos de producción con HTTPS, las cookies de sesión y estado adoptan el prefijo `__Host-` (`__Host-rcl_session` y `__Host-rcl_oauth_state`, `auth.router.ts:19-20, 44-45`), asegurando atributos `HttpOnly`, `SameSite=Lax`, `Secure` y aislamiento de ruta `/`. Las mutaciones de estado se blindan mediante `requireTrustedOrigin` (`auth.router.ts:33-40`), exigiendo cabecera `Origin` idéntica a `frontendOrigin`.
4. **Persistencia Transaccional y Preservación de Privilegios:** La creación de sesión ejecuta un `UPSERT` en `discord_users` (`postgres-auth.repository.ts:29-41`) que sincroniza perfil visual (`username`, `globalName`, `avatarHash`) pero **omite intencionadamente la columna `role`**, preservando intactos los permisos de administración u ownership asignados por el sistema de gobernanza.
5. **Consumo Atómico de Estados de Uso Único:** El consumo de estados OAuth se efectúa mediante `DELETE ... WHERE expires_at > now RETURNING token_hash` (`postgres-auth.repository.ts:14-20`), garantizando de forma atómica en una única sentencia SQL que un estado no pueda reutilizarse en ataques de repetición.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Rutas y Transporte** | [routes.md](routes.md) | Endpoints de OAuth2 (`/discord`, `/discord/callback`), consulta de sesión (`/me`) y revocación (`/logout`), prevención de *cookie shadowing* y middleware de origen confiable. |
| **Lógica de Procesamiento y Criptografía** | [processing.md](processing.md) | Flujo del protocolo OAuth2, ciclo de vida de estados (10 min) y sesiones (7 días), hashing SHA-256, comparación en tiempo constante y mitigación de fugas de proveedor. |
| **Persistencia Relacional** | [persistence.md](persistence.md) | Implementación de `PostgresAuthRepository`, atomicidad SQL con `DELETE ... RETURNING`, transacciones ACID de sesión y preservación estricta de roles en upsert. |
| **Validación y Manejo de Errores** | [validation.md](validation.md) | Esquemas Zod para tokens y perfiles de Discord, validación regex de Discord Snowflake (`/^\d{17,20}$/`), sanitización total de errores 502 y catálogo de códigos de error. |
| **Contratos y DTOs** | [contracts.md](contracts.md) | Interfaces TypeScript exportadas (`AuthUser`), opciones de inicialización (`AuthOptions`) y modelos internos de perfil (`DiscordProfile`). |

---

## 3. Garantías de Fiabilidad y Reglas de Dominio

- **Disociación Estricta de Dominios de Roles:** El módulo de autenticación resuelve y valida el rol de gobernanza del sistema (`appRole`: `'viewer'`, `'admin'`, `'owner'`, `packages/contracts/src/auth.ts:1-7`). No gestiona ni muta roles de plantilla deportiva (`rosterRole`: top, jungle, mid, adc, support, substitute, coach, staff, partners) ni capitanías, los cuales pertenecen a `team_memberships` y se mutan vía `crud-operations`.
- **Inmunidad a Open Redirect:** El callback OAuth2 redirige de forma fija e inmutable a `options.frontendOrigin` (`auth.router.ts:79`). El enrutador no acepta parámetros de redirección dinámica en query string bajo ninguna circunstancia.
- **Purga Pasiva de Registros:** Cada inicio de flujo de login (`AuthService.start`, `auth.service.ts:21`) ejecuta `deleteExpired` sobre `oauth_states` y `auth_sessions`, impidiendo la acumulación indefinida de registros caducados en disco.
