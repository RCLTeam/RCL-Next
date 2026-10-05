# Arquitectura del Backend y Servicios de API

[⬅️ Volver al Índice Principal de Documentación](../README.md) | [Siguiente: Documentación Web ➡️](../web/README.md)

---

## 1. Resumen Ejecutivo

El backend de RCL-Next (`apps/api`) proporciona la plataforma de servicios del monorepo, construida sobre **Node.js 22+**, el framework HTTP **Express**, el motor de persistencia relacional **Drizzle ORM** sobre **PostgreSQL 16+** (y compatible con **PGlite** en memoria) y pasarelas de comunicación en tiempo real mediante **WebSocket** (`ws`).

La arquitectura sigue el patrón de **Rebanadas Verticales (*Vertical Slice Architecture*)**, donde cada funcionalidad de negocio se organiza como un módulo autónomo y altamente cohesivo en `apps/api/src/modules/`. Cada módulo encapsula de forma estricta sus capas de transporte (`routes.md`), lógica de procesamiento agnóstica (`processing.md`), acceso a datos transaccional (`persistence.md`), validación defensiva (*fail-fast*, `validation.md`) y contratos compartidos (`contracts.md`).

---

## 2. Principios de Diseño del Backend

1. **Aislamiento por Rebanadas Verticales:** Cada módulo es dueño de su lógica de negocio y de sus consultas SQL. No existen capas de "servicios genéricos" transversales que acoplen dominios dispares.
2. **Validación Perimetral Estricta:** Las cargas útiles entrantes se validan antes de alcanzar la capa de procesamiento o la base de datos, garantizando tipos estrictos en tiempo de ejecución.
3. **Flujos Binarios sin Fuga de Memoria Heap:** La ingesta de repeticiones pesadas (`.rofl`) y volcados de base de datos (`.dump`) utiliza streams en disco con contrapresión (`pause/drain`), evitando la acumulación de búferes en la memoria heap de Node.js.
4. **Persistencia Transaccional ACID:** Toda mutación relacional compleja opera bajo transacciones de PostgreSQL protegidas con bloqueos pesimistas a nivel de fila (`SELECT ... FOR UPDATE`) o bloqueos consultivos (`pg_advisory_lock`), garantizando consistencia ante concurrencia agresiva.
5. **Autenticación Federada y Control de Acceso:** La identidad se delega en Discord OAuth2, estableciendo sesiones firmadas y verificando roles de aplicación (`appRole`: `'viewer'`, `'admin'`, `'owner'`) en cada ruta administrativa.

---

## 3. Catálogo de Módulos de la API

La API de RCL-Next se compone de trece módulos funcionales, cada uno documentado exhaustivamente en su respectiva subcarpeta atómica:

| Módulo | Enlace | Resumen Funcional |
|---|---|---|
| **Subida y Procesamiento ROFL** | [rofl-upload/README.md](rofl-upload/README.md) | Pasarela WebSocket bidireccional (`/ws/rofl-upload`), spooling en disco bajo contrapresión, orquestación del parser binario Python y persistencia atómica en 5 tablas Drizzle. |
| **Puente con Bot de Discord** | [discord-bridge/README.md](discord-bridge/README.md) | Cliente de transporte WebSocket hacia el bot comunitario de Discord, conexión perezosa (*lazy connection*), cola de incidentes y reconexión exponencial. |
| **Buzón de Sugerencias** | [suggestions/README.md](suggestions/README.md) | Ingesta asíncrona de propuestas ciudadanas con HTTP 202 Accepted, máquina de estados reactiva en memoria con TTL de 2 horas y logger de incidentes. |
| **Motor de Competición** | [competition/README.md](competition/README.md) | Clasificaciones en tiempo real, desempates olímpicos, cómputo de rachas, estadísticas de campeones, métricas individuales (KDA, CS/min) y algoritmo ponderado de MVP. |
| **Autenticación y Sesiones** | [auth/README.md](auth/README.md) | Intercambio de código Discord OAuth2, cookies de sesión firmadas e inmutables, consulta de perfil en `/api/v1/auth/me` y middleware de autorización. |
| **Gobernanza de Roles** | [member-roles/README.md](member-roles/README.md) | Administración y auditoría de permisos de sistema (`viewer`, `admin`, `owner`) en `discord_users`, con disociación estricta de roles deportivos de plantilla. |
| **Motor de Operaciones CRUD** | [crud-operations/README.md](crud-operations/README.md) | Motor administrativo genérico para entidades de competición, detección preventiva de bloqueos por claves foráneas, borrado transaccional y traza de auditoría. |
| **Transferencia de Base de Datos** | [database-transfer/README.md](database-transfer/README.md) | Generación y restauración de copias de seguridad PostgreSQL mediante comandos `COPY` nativos, empaquetado gzip, streaming y ordenación topológica de tablas. |
| **Contenido Editorial e Inicio** | [home-content/README.md](home-content/README.md) | Gestión de noticias, artículos editoriales y selección transaccional del quinteto ideal de cada jornada (*Team of the Week*) para la página de inicio. |
| **Predicciones Comunitarias** | [predictions/README.md](predictions/README.md) | Quinielas de partidos (Bo1, Bo3, Bo5), control estricto de ventanas de votación en horario peninsular (Madrid), ocultación de tendencias hasta el cierre y ranking. |
| **Metadatos de Página** | [page-metadata/README.md](page-metadata/README.md) | Títulos y descripciones por ruta para el HTML inicial y `GET /api/v1/page-metadata`, consultas ligeras de fichas de equipo, jugador y partido, y caché en memoria de 60 segundos con *single-flight*. |
| **Logos de Equipos** | [team-logos/README.md](team-logos/README.md) | Motor de almacenamiento en disco (`TeamLogosStore`), servicio público de imágenes con ETag/304, inspección de magic bytes (PNG, JPEG, WebP), cuota de 5 MiB y protección de `placeholder.webp`. |
| **Sitemap XML Dinámico** | [sitemap/README.md](sitemap/README.md) | Generación dinámica del mapa del sitio XML (protocolo Sitemaps 0.9), agregación de rutas estáticas y entidades dinámicas (equipos, jugadores, editorial), deduplicación single-flight y caché en memoria con TTL de 12 horas. |

---

## 4. Enlaces Cruzados con Otras Áreas

- **Base de Datos y Esquema Relacional:** Para consultar las 21 tablas relacionales, 6 tipos enumerados y restricciones de PostgreSQL, ver [docs/database/README.md](../database/README.md).
- **Frontend y Clientes Web:** Para la integración de estos endpoints con la interfaz React 19, ver [docs/web/README.md](../web/README.md).
- **Suites de Pruebas Automatizadas:** Para auditar los casos de prueba unitarios e integrados de la API, ver [docs/testing/suites/api.md](../testing/suites/api.md) y [docs/testing/suites/integration.md](../testing/suites/integration.md).
