# Configuración de la API: variables de entorno

[⬅️ Volver a docs/api/](../README.md) | [Siguiente: Autenticación ➡️](../auth/README.md)

---

## 1. Resumen Ejecutivo

Toda la configuración de `apps/api` pasa por `parseEnvironment` (`apps/api/src/config/env.ts:63-154`), que valida el entorno con Zod al arrancar. `loadEnvironment` (`env.ts:156-159`) carga antes el `.env` de la raíz del repositorio; no existe otro `.env` de la API. Si alguna variable no es válida, el proceso se detiene con `Invalid environment: <CLAVE>, <CLAVE>`: el mensaje enumera solo los nombres de las claves, nunca sus valores.

`server.ts` reparte los valores ya validados entre los módulos (`createApp`, almacenes de imágenes y logos, sitemap, puente de Discord). Ningún módulo lee `process.env` directamente. La única excepción es `NativePostgresBackupTools` (`apps/api/src/modules/database-transfer/postgres-backup-tools.ts:35-41`), que hereda el entorno del proceso para que `pg_dump` y `pg_restore` se encuentren en `PATH`; no lee configuración de él.

La plantilla única es [`.env.example`](../../../.env.example) en la raíz, con todas las variables comentadas.

---

## 2. Variables

Ninguna variable es obligatoria salvo `DATABASE_URL`. Las demás tienen un valor por defecto o desactivan su funcionalidad cuando faltan.

| Variable | Por defecto | Validación | Consumidor |
|---|---|---|---|
| `DATABASE_URL` | — (obligatoria) | URL con esquema `postgres:` o `postgresql:`. | `createDatabase`, copias de seguridad. |
| `NODE_ENV` | `development` | `development`, `test` o `production`. | Reglas de URL de la sección 3. |
| `HOST` | `127.0.0.1` | Texto. | `server.listen`. |
| `PORT` | `3001` | Entero entre 1 y 65535. | `server.listen`. |
| `POSTGRES_BIN_DIR` | vacío (usa `PATH`) | Texto. | `NativePostgresBackupTools`. |
| `CORS_ORIGIN` | `http://localhost:5173` | Origen exacto; ver sección 3. Se comprueba siempre. | CORS, cookies de sesión, orígenes WebSocket. |
| `DISCORD_CLIENT_ID` | vacío | 17-20 dígitos si el inicio de sesión está activo. | `DiscordOAuthClient`. |
| `DISCORD_CLIENT_SECRET` | vacío | Obligatoria si el inicio de sesión está activo. | `DiscordOAuthClient`. |
| `DISCORD_REDIRECT_URI` | vacío | Ruta exacta `/api/v1/auth/discord/callback`; ver sección 3. | `DiscordOAuthClient`, cookies `Secure`. |
| `DISCORD_BOT_WS_URL` | vacío (puente desactivado) | Si no está vacía, URL `ws://` o `wss://`. Se comprueba siempre. | `DiscordBridgeClient`. |
| `DISCORD_BOT_WS_SUPERTOKEN` | vacío | Texto. | `DiscordBridgeClient`. |
| `TRUST_PROXY` | `loopback` | `false`, número de saltos o lista de direcciones, subredes o `loopback`/`linklocal`/`uniquelocal`. `true` se rechaza. | `app.set('trust proxy')`. |
| `FRONTEND_URL` | sin definir: `https://rebelcrownlegacy.es` | Si no está vacía, URL `http://` o `https://`. | `SitemapService` (opción `baseUrl`). |
| `WEB_DIST_DIR` | sin definir: la API no sirve la web | Texto. | `webPageRouter` (`createApp`, opción `webDirectory`). |
| `TEAM_LOGO_DIR` | sin definir: `apps/web/public/images/teams_logo/` | Texto. | `TeamLogosStore`. |
| `EDITORIAL_IMAGE_DIR` | `data/editorial-images` (relativa al directorio de trabajo) | Texto. | `EditorialImageStore` de las rutas y de la limpieza horaria. |

`ALLOW_DEMO_SEED` solo la usan los comandos de base de datos (`packages/database/src/seed.ts`); la API la ignora.

### Valores vacíos

- `FRONTEND_URL` y `WEB_DIST_DIR` vacías (o solo con espacios) equivalen a no definirlas.
- `TEAM_LOGO_DIR` y `EDITORIAL_IMAGE_DIR` vacías se conservan tal cual: el almacén resuelve los ficheros respecto al directorio de trabajo, igual que antes de pasar por el esquema. El valor por defecto solo se aplica cuando la variable no existe.
- Las rutas no se comprueban en disco al arrancar; los almacenes crean su directorio al escribir.

---

## 3. Reglas de URL

Se aplican en el `superRefine` de `env.ts:92-147`:

1. **Puente de Discord (`env.ts:94-111`):** `DISCORD_BOT_WS_URL`, si tiene valor, debe ser una URL con protocolo `ws:` o `wss:`. No depende del inicio de sesión con Discord.
2. **Inicio de sesión con Discord (`env.ts:113-126`):** si cualquiera de `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` o `DISCORD_REDIRECT_URI` tiene valor, las tres son obligatorias, el identificador debe tener 17-20 dígitos y `DISCORD_REDIRECT_URI` pasa a validarse con la regla 3. Si las tres están vacías, el inicio de sesión queda desactivado (las rutas de autenticación responden 503).
3. **`CORS_ORIGIN` siempre, y `DISCORD_REDIRECT_URI` con el inicio de sesión activo (`env.ts:127-146`):** sin credenciales en la URL, sin query ni fragmento, y con `https:`; `http:` solo se admite para `localhost`, `127.0.0.1` o `[::1]` fuera de `NODE_ENV=production`. `CORS_ORIGIN` debe ser exactamente un origen (sin ruta ni barra final).

Consecuencia: con `NODE_ENV=production`, el valor por defecto de `CORS_ORIGIN` (`http://localhost:5173`) se rechaza aunque no haya credenciales de Discord; hay que definir el origen HTTPS del sitio.

---

## 4. Pruebas

- `apps/api/src/config/env.test.ts`: valores por defecto, `DATABASE_URL`, `PORT`, `TRUST_PROXY`, validación del puente y de `CORS_ORIGIN` sin credenciales de Discord, rutas y `FRONTEND_URL`, y el conjunto de variables que define el despliegue de producción (mismos nombres, valores ficticios).
- `apps/api/src/config/auth-env.test.ts`: reglas del inicio de sesión con Discord.
- `apps/api/src/config/load-env.test.ts`: carga del `.env` de la raíz.
- `tests/integration/sitemap-router.test.ts`: `createApp` usa `frontendUrl` para el sitemap y recurre al dominio de producción si falta.
