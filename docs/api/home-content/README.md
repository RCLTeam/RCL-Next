# Módulo API: Editorial Home Content & Team of the Week

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: API Predictions ➡️](../../../docs/api/predictions/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/home-content/` gestiona el ciclo de vida de las publicaciones editoriales (noticias, reportajes, entrevistas y crónicas) y la selección del quinteto ideal de cada jornada (*Team of the Week* o quinteto de la semana) en la plataforma RCL-Next. Proporciona una superficie de lectura pública de alto rendimiento para la página de inicio y una superficie de administración transaccional protegida contra accesos no autorizados, desbordamientos de almacenamiento y alteraciones relacionales.

El diseño y la implementación del módulo se rigen por los siguientes principios de ingeniería:

1. **Segregación Estricta de Superficies Pública y Administrativa:** Las consultas de artículos publicados y quintetos visibles se exponen mediante rutas abiertas y sin estado (`GET /articles`, `GET /articles/:id`, `GET /weekly-teams/:id/rounds`, `GET /weekly-teams/:id`), mientras que todas las operaciones de mutación, visualización de borradores y subida de archivos se confinan bajo el prefijo `/admin`, custodiado por `requireAuth(auth, 'admin')` y validación de origen seguro `requireTrustedOrigin` (`home-content.router.ts:34, 47`).
2. **Refutación Fáctica del Rol Editorial:** En el modelo relacional del sistema (`packages/database/src/schema.ts:24`), el tipo enumerado `app_role` contiene estrictamente `['viewer', 'admin', 'owner']`. **No existe ningún rol `editor` ni permisos intermedios**. En consecuencia, el acceso a las funciones de redacción y publicación queda reservado de forma unívoca a usuarios con rol `admin` u `owner`.
3. **Almacenamiento Local Aislado y Detección de Magic Bytes:** La subida de imágenes editoriales (`EditorialImageStore`, `editorial-image.store.ts:1-42`) opera sobre el sistema de archivos local (`process.env.EDITORIAL_IMAGE_DIR ?? 'data/editorial-images'`). Bloquea cualquier intento de salto de directorio (*path traversal*) mediante expresiones regulares alfanuméricas de UUID estricto y verifica la firma binaria de bytes mágicos (PNG, JPEG, WebP) con un límite máximo de 5 MiB por archivo.
4. **Recolección Concurrente de Imágenes Huérfanas con Bloqueo de Tabla:** Para prevenir la acumulación residual de archivos tras modificaciones o eliminaciones de artículos, el repositorio ejecuta una purga atómica respaldada por `LOCK TABLE editorial_articles IN SHARE ROW EXCLUSIVE MODE` (`postgres-home-content.repository.ts:64`), garantizando que ninguna imagen en uso en otro artículo sea eliminada concurrentemente.
5. **Auditoría Transaccional y Verificación Deportiva de Quintetos:** La selección de jugadores para el *Team of the Week* valida mediante un `INNER JOIN` de 4 tablas (`postgres-home-content.repository.ts:147-193`) que cada miembro haya disputado al menos una partida oficial en la división, jornada y posición específica asignada, rechazando jugadores inexistentes o posiciones duplicadas (`home-content.service.ts:59-62`).
6. **Gestión Manual de Marcas de Tiempo (`updated_at`):** Debido a que `editorial_articles` y `home_weekly_teams` están deliberadamente excluidas del bucle del trigger PL/pgSQL `set_updated_at` (`0000_initial_schema.sql:389-394`), toda mutación en el repositorio inyecta explícitamente `updatedAt: new Date()` (`postgres-home-content.repository.ts:109, 279`).

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Rutas y Controladores** | [routes.md](routes.md) | Definición de los 13 endpoints HTTP montados bajo `/api/v1/home-content`, cabeceras `Cache-Control: no-store`, control de acceso admin/owner, servicio de estáticos con `nosniff` y códigos de estado. |
| **Lógica de Procesamiento** | [processing.md](processing.md) | Ciclo de vida de artículos (borrador vs. publicado), fechas de publicación deterministas, almacenamiento de imágenes con validación de bytes mágicos, recolección de basura huérfana y normalización de roles deportivos. |
| **Persistencia y Base de Datos** | [persistence.md](persistence.md) | Operaciones con Drizzle ORM sobre `editorial_articles` y `home_weekly_teams`, bloqueos pesimistas `for('update')`, auditoría en `audit_logs`, exclusión de triggers SQL y advertencia de consultas N+1 en `listWeeklyTeams`. |
| **Validación y Errores** | [validation.md](validation.md) | Esquemas Zod estrictos (`articleInput`, `teamInput`), reglas de texto alternativo obligatorio para portadas, límite de 5 roles únicos y catálogo de errores de aplicación (400, 401, 403, 404, 413, 422). |
| **Contratos y DTOs** | [contracts.md](contracts.md) | Interfaces TypeScript exportadas en `@rcl/contracts` (`EditorialArticle`, `EditorialInput`, `WeeklyTeam`, `WeeklyPlayer`, `WeeklyCandidate`) y esquemas de intercambio JSON. |

---

## 3. Garantías de Fiabilidad y Advertencias de Rendimiento

- **Subidas abandonadas:** `POST /api/v1/home-content/admin/images/discard` recibe `{ urls: string[] }` (hasta 100 URLs locales), exige rol admin/owner y origen válido, y elimina únicamente imágenes sin referencias en artículos, incluidos borradores. Es idempotente. El servidor también busca imágenes huérfanas de más de siete días al arrancar y cada hora, para cubrir cierres del navegador o fallos de red. La tarea se detiene y se espera durante el apagado.
- **Exclusión de Triggers PL/pgSQL:** Las tablas `editorial_articles` y `home_weekly_teams` no poseen trigger automático de base de datos para `updated_at`. Cualquier script externo de migración o inserción directa debe proporcionar la marca de tiempo explícitamente.
- **Riesgo de Bloqueo en Limpieza de Imágenes:** La instrucción `LOCK TABLE editorial_articles IN SHARE ROW EXCLUSIVE MODE` detiene escrituras concurrentes en la tabla editorial durante la verificación de imágenes huérfanas (`postgres-home-content.repository.ts:64`).
- **Complejidad N+1 en `listWeeklyTeams`:** El método `listWeeklyTeams` ejecuta una consulta adicional de candidatos con 4 `INNER JOIN` por cada jornada recuperada (`postgres-home-content.repository.ts:207-223`). Para divisiones con múltiples jornadas, debe considerarse la precarga por lotes si el volumen de jornadas aumenta.
