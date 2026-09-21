# Autenticación Discord

La API implementa OAuth2 Authorization Code con el permiso `identify`, siguiendo la [documentación oficial de Discord](https://docs.discord.com/developers/topics/oauth2). No necesita bot, correo electrónico ni pertenencia a un servidor.

## Configuración local

1. Crea o selecciona una aplicación en el [Discord Developer Portal](https://discord.com/developers/applications).
2. En **OAuth2 → Redirects**, registra exactamente `http://localhost:3001/api/v1/auth/discord/callback`.
3. Añade a `.env` las siguientes variables con las credenciales de esa aplicación. El secreto pertenece al backend y nunca debe incorporarse al frontend o al repositorio.

```dotenv
DISCORD_CLIENT_ID=tu_client_id
DISCORD_CLIENT_SECRET=tu_client_secret
DISCORD_REDIRECT_URI=http://localhost:3001/api/v1/auth/discord/callback
CORS_ORIGIN=http://localhost:5173
```

4. Ejecuta `pnpm db:migrate` y `pnpm dev:api`.
5. Abre `http://localhost:3001/api/v1/auth/discord`. Al aceptar, volverás a `CORS_ORIGIN` con la sesión iniciada. Desde el mismo navegador puedes consultar `http://localhost:3001/api/v1/auth/me`.

El frontend `apps/web` incluye **Entrar con Discord** en la cabecera, muestra el usuario conectado y permite cerrar sesión. Con PostgreSQL disponible en `DATABASE_URL` y la API arrancada mediante `pnpm dev:api`, ejecuta `pnpm dev:web` en otra terminal y abre `http://localhost:5173`.

Usa `localhost` tanto para la API como para el frontend local; no mezcles `localhost` y `127.0.0.1`. En producción se exige HTTPS en ambas URLs. Usa el mismo sitio (por ejemplo `rcl.example.com` y `api.example.com`) para que las cookies `SameSite=Lax` viajen en las consultas del frontend. `CORS_ORIGIN` es un origen sin ruta ni barra final.

Las tres variables Discord vacías deshabilitan la autenticación y sus rutas devuelven `503 AUTH_NOT_CONFIGURED`; la API pública sigue funcionando. Una configuración parcial detiene el arranque indicando los nombres de las variables inválidas, sin revelar valores.

## Contrato HTTP

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/v1/auth/discord` | Crea un estado temporal, establece una cookie y redirige a Discord. |
| GET | `/api/v1/auth/discord/callback` | Valida y consume el estado, obtiene el perfil, crea una sesión y redirige a `CORS_ORIGIN`. |
| GET | `/api/v1/auth/me` | `200 { data: { discordId, username, globalName, avatarHash, role } }`; `401` sin sesión válida. |
| POST | `/api/v1/auth/logout` | Revoca la sesión y borra su cookie; `204`, incluso si ya no había sesión. Requiere `Origin` exactamente igual a `CORS_ORIGIN`. |

El frontend debe iniciar el login con una navegación, por ejemplo un enlace a `/api/v1/auth/discord` en el origen de la API. Para consultas y logout:

```ts
const response = await fetch(`${apiOrigin}/api/v1/auth/me`, { credentials: 'include' });
await fetch(`${apiOrigin}/api/v1/auth/logout`, {
  method: 'POST',
  credentials: 'include'
});
```

Los errores se devuelven como `{ error: { code, message } }`. Un estado inválido, caducado o ya consumido devuelve `400 INVALID_OAUTH_STATE`; cancelar la autorización devuelve `400 DISCORD_ACCESS_DENIED`; un código ausente devuelve `400 INVALID_OAUTH_CODE`. Los fallos de comunicación o respuestas inválidas de Discord devuelven `502 DISCORD_UNAVAILABLE`. En esos casos se debe volver a iniciar el flujo. No se aceptan destinos de redirección enviados por el cliente.

## Sesiones y permisos

- Estado OAuth aleatorio de 256 bits, ligado a una cookie HttpOnly, válido durante 10 minutos y consumido atómicamente una sola vez en PostgreSQL.
- Sesión opaca aleatoria de 256 bits, válida durante 7 días sin renovación automática. Solo se guarda su SHA-256; tampoco se persisten los tokens de acceso o refresco de Discord.
- Cookies HttpOnly, SameSite=Lax, Path=/ y sin Domain. Con HTTPS se añade Secure y se usa el prefijo `__Host-`.
- El nuevo login revoca la sesión anterior del mismo navegador dentro de la transacción de creación; otras sesiones del usuario permanecen activas. Logout revoca únicamente la sesión actual.
- Las rutas de autenticación no se cachean y omiten el referente. Las sesiones y estados caducados se limpian al iniciar nuevos flujos; siempre se rechazan por fecha aunque no se hayan eliminado aún.
- Se actualizan username, globalName y avatarHash al iniciar sesión. Los usuarios nuevos reciben `viewer`; el login conserva el rol existente y no vincula automáticamente jugadores o equipos.
- `requireAuth(options)` exige sesión; `requireAuth(options, 'admin')` admite admin u owner, y `requireAuth(options, 'owner')` exige owner. PostgreSQL se consulta en cada petición, por lo que los permisos y las revocaciones tienen efecto inmediato. `requireTrustedOrigin(CORS_ORIGIN)` protege las operaciones que mutan datos mediante cookies.

No se conceden privilegios a partir del login o los roles del servidor Discord. Solo el módulo protegido de gestión de roles permite cambiar `viewer`, `admin` u `owner`. El owner inicial queda sin asignar.

## Migración y pruebas

El esquema inicial `0000_initial_schema.sql` incluye las 19 tablas, con un único snapshot y una entrada en el journal. `discord_users` es la tabla existente de identidad y permisos; la autenticación la reutiliza. `auth_sessions` guarda las sesiones y `oauth_states` los estados temporales de autorización, sin duplicar usuarios. Ambas están integradas en el esquema inicial, con índices de caducidad y borrado de sesiones en cascada al eliminar el usuario. No hay una migración incremental de autenticación porque la base todavía no está en producción.

Las pruebas HTTP ejecutan el esquema inicial en PGlite y simulan únicamente las respuestas externas de Discord. Verifican cookies, intercambio de código, protección de estado, consumo concurrente, sesiones, roles, logout y errores sin filtración de secretos. Para comprobar el consentimiento real en Discord se necesitan las credenciales y una base PostgreSQL configurada.

## Acceso al frontend administrativo

`AuthProvider` consulta `/api/v1/auth/me` y comparte el resultado con los controles de cuenta y `RequireAdmin`. Las rutas `/admin`, `/admin/rofl/upload`, `/admin/crud` y `/admin/member-roles`, con o sin barra final, muestran la consola únicamente con una sesión verificada de rol `admin` u `owner`. Las sesiones anónimas reciben un enlace a Discord; los demás roles reciben una denegación; un fallo de sesión ofrece reintento. El panel se desmonta durante el cierre de sesión y permanece bloqueado después de cerrarla. El enlace administrativo aparece en la navegación para admin y owner.

Esta guarda protege la navegación y el montaje del frontend. La API aplica los permisos en cada petición. El gateway `/ws/rofl-upload` valida la sesión y exige admin u owner al conectar, antes de procesar y antes de persistir una importación. `organizer` no existe en el contrato ni en el enum actuales.
