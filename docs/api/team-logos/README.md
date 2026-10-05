# Módulo API: Team Logos & Asset Storage

[⬅️ Volver a docs/api/](../README.md) | [Siguiente: Rutas HTTP ➡️](routes.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/team-logos/` implementa el motor de almacenamiento persistente y la superficie de servicios HTTP para la gestión de escudos y emblemas de equipos en la plataforma RCL-Next. Proporciona una capa desacoplada que combina el servicio público de archivos estáticos de alto rendimiento con una interfaz administrativa segura para la carga, listado y eliminación de insignias.

El diseño arquitectónico del módulo se fundamenta en los siguientes principios técnicos:

1. **Modelo de Almacenamiento Híbrido y Desacoplado:** Los recursos gráficos binarios residen directamente en el sistema de archivos del servidor mediante la clase `TeamLogosStore` (`apps/api/src/modules/team-logos/team-logos.store.ts:6-90`). La base de datos relacional PostgreSQL no almacena objetos binarios (BLOBs), sino únicamente la referencia canónica en la columna `teams.logo_url` (`packages/database/src/schema.ts:190`). Este desacoplamiento preserva la ligereza de las copias de seguridad de PostgreSQL (`pg_dump` y streaming `COPY`) y elimina la sobrecarga transaccional de manejar flujos binarios pesados en la base de datos.
2. **Segregación Estricta de Superficies:**
   - **Superficie Pública de Lectura (`GET /images/:name`):** Accesible sin autenticación, optimizada para clientes web y redes de distribución con cabeceras `Cache-Control: public, max-age=3600, must-revalidate`, prevención de inferencia MIME mediante `X-Content-Type-Options: nosniff` y soporte de validación condicional ETag con respuestas HTTP 304 Not Modified (`apps/api/src/modules/team-logos/team-logos.router.ts:11-18`).
   - **Superficie Administrativa de Mutación (`/admin`):** Confinada bajo directivas de control de caché `Cache-Control: no-store` (`team-logos.router.ts:7-10`), autenticación obligatoria de sesión Discord restringida a roles `admin` u `owner` (`team-logos.router.ts:25`), y protección contra falsificación de peticiones en sitios cruzados (CSRF) mediante verificación estricta de origen seguro `requireTrustedOrigin` (`team-logos.router.ts:27`).
3. **Escrituras Atómicas en Disco sin Condiciones de Carrera:** La persistencia física de nuevos logos utiliza la bandera de sistema POSIX `wx` (`O_CREAT | O_EXCL`) en la llamada `writeFile` (`team-logos.store.ts:68`). Si dos peticiones intentan registrar un archivo con el mismo identificador simultáneamente, el kernel del sistema operativo garantiza que únicamente la primera escritura prospere, rechazando colisiones con el error `EEXIST`, transformado en HTTP 409 `LOGO_EXISTS` (`team-logos.store.ts:70-72`).
4. **Validación Perimetral y Análisis Forense de Bytes Mágicos:** Antes de tocar el disco, cada carga útil es sometida a una inspección de tres niveles:
   - Expresión regular restrictiva de nombre de archivo `/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}\.(png|jpe?g|webp)$/` (`team-logos.store.ts:13`), inmune a ataques de salto de directorio (*path traversal*).
   - Límite estricto de tamaño de carga útil de 5 MiB (5.242.880 bytes) (`team-logos.store.ts:47-48`).
   - Verificación binaria de *magic bytes* para los formatos autorizados (PNG: `89504e470d0a1a0a`, JPEG: `ffd8ff`, WebP: `RIFF`..`WEBP`), contrastados unívocamente contra la cabecera `Content-Type` y la extensión (`team-logos.store.ts:49-65`).
5. **Inmunidad contra Enlaces Simbólicos y Desreferenciación Maliciosa:** Al recuperar o borrar un archivo (`team-logos.store.ts:22-30`), se ejecuta `lstat()`. Si la ruta resultante no corresponde a un archivo regular o constituye un enlace simbólico (`!stat.isFile() || stat.isSymbolicLink()`), el módulo aborta con HTTP 404 `NOT_FOUND`, impidiendo la fuga de información mediante enlaces simbólicos hacia rutas fuera del directorio asignado.
6. **Protección de Inmutabilidad del Logo de Reserva (`placeholder.webp`):** El emblema genérico por defecto se encuentra custodiado en memoria mediante `assertMutable` (`team-logos.store.ts:82-89`). Cualquier intento de sobrescritura o eliminación contra `placeholder.webp` (evaluado de forma insensible a mayúsculas) es bloqueado inmediatamente con HTTP 403 `PROTECTED_LOGO`. Asimismo, la configuración `.gitignore` excluye todas las insignias dinámicas del repositorio mientras preserva `!/apps/web/public/images/teams_logo/placeholder.webp` bajo control de versiones.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Rutas y Controladores** | [routes.md](routes.md) | Catálogo de los 4 endpoints HTTP (`/images/:name`, `/admin`, `POST /admin/:name`, `DELETE /admin/:name`), cabeceras de caché pública y privada, control de acceso por roles y códigos de respuesta. |
| **Persistencia y Almacenamiento** | [persistence.md](persistence.md) | Arquitectura del almacén de archivos `TeamLogosStore`, operaciones atómicas en disco con bandera `wx`, sanitización de rutas, análisis de bytes mágicos e integración con `teams.logo_url`. |
| **Contratos y Catálogo de Errores** | [contracts.md](contracts.md) | DTOs TypeScript (`TeamLogoEntry`), contratos de transporte en cliente (`teamLogosApi`), catálogo exhaustivo de códigos de error (400, 401, 403, 404, 409, 413, 422, 503) y normalizadores frontend. |

---

## 3. Integración Arquitectónica y Variables de Entorno

### Inyección de Dependencias en la Aplicación
El enrutador se crea y monta en el pipeline principal de Express (`apps/api/src/app.ts:74-77`) bajo el prefijo canónico `/api/v1/team-logos`:

```typescript
// apps/api/src/app.ts:74-77
app.use(
  '/api/v1/team-logos',
  teamLogosRouter(options.auth, new TeamLogosStore(options.teamLogoDirectory))
);
```

### Configuración del Directorio de Almacenamiento
La ruta física de persistencia se resuelve a través de la variable de entorno `TEAM_LOGO_DIR`, validada por `parseEnvironment` y entregada por `server.ts` a `createApp` (`apps/api/src/server.ts:75`, `apps/api/src/modules/team-logos/team-logos.store.ts:7-11`):

- **Variable de Entorno:** `TEAM_LOGO_DIR` (comentada en `.env.example:23-24`; ver [configuración](../config/README.md)). Es opcional también en producción y permite aislar el almacenamiento de logos en un directorio persistente dedicado.
- **Ruta por Defecto:** En ausencia de la variable, el constructor utiliza la ruta relativa al módulo: `fileURLToPath(new URL('../../../../web/public/images/teams_logo/', import.meta.url))`, permitiendo que la aplicación web sirva las imágenes directamente en entornos de desarrollo local.
