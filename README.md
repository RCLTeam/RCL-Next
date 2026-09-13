# RCL

Nueva plataforma de Rebel Crown Legacy. Es un monorepo con React, una API Node.js/TypeScript, bots de Discord y PostgreSQL.

## Estado inicial

En esta primera entrega está listo el cimiento de datos: el esquema PostgreSQL, su migración inicial y la configuración de Drizzle. El modelo conserva el historial por temporada, plantilla, partido, mapa y estadísticas; no replica los contadores agregados de la aplicación antigua porque se calculan desde datos verificables.

## Requisitos

- Node.js 22 o superior.
- pnpm 11.
- Docker Desktop, para levantar PostgreSQL localmente.

## Arranque local de la base de datos

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
```

El último comando aplica las migraciones versionadas. Para inspeccionar los datos, ejecuta `pnpm db:studio`.

## Estructura

```text
apps/                 Aplicaciones web, API y bots (siguientes fases)
packages/database/    Esquema Drizzle, migraciones y cliente PostgreSQL
docs/                 Decisiones y documentación de arquitectura
```

## Flujo de equipo

1. Crear una rama desde `main`: `feat/nombre-corto`.
2. Una migración nueva se crea con `pnpm db:generate` tras modificar el esquema.
3. Revisar siempre el SQL generado y versionarlo junto al cambio que lo necesita.
4. Abrir un pull request; no se hacen cambios de estructura directamente en producción.

La publicación remota se hará en una organización/repositorio de GitHub cuando esté decidida la cuenta que lo alojará; el repositorio local ya está inicializado en la rama `main`.
