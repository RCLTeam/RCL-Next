# Proxy de avatares de Discord

[Volver a autenticación](README.md) · [Rutas](routes.md) · [Pruebas del proxy](../../testing/discord-avatars.md)

El avatar de la cuenta se solicita al mismo origen de la web. El backend descarga la imagen de Discord y devuelve sus bytes sin copiar las cabeceras del proveedor, incluida `Set-Cookie`. Así la carga del avatar no conecta el navegador con el CDN de Discord ni introduce su cookie de terceros. No se crea una cookie nueva para las imágenes; las cookies de sesión de RCL conservan su función habitual.

## Contrato HTTP

`GET /api/v1/discord-avatars/:discordId/:hash`

La ruta es pública y está montada en `apps/api/src/app.ts` incluso cuando OAuth no está configurado. La implementación está en `apps/api/src/modules/auth/discord-avatars.router.ts`.

| Parámetro | Validación |
|---|---|
| `discordId` | Entre 17 y 20 dígitos (`^\d{17,20}$`). |
| `hash` | 32 caracteres hexadecimales en minúscula, con prefijo opcional `a_` (`^(a_)?[a-f0-9]{32}$`). Sin extensión. |

El servidor construye exclusivamente `https://cdn.discordapp.com/avatars/{discordId}/{hash}.{extension}?size=128`. Utiliza GIF si el hash empieza por `a_` y PNG en los demás casos. No acepta una URL de destino ni sigue redirecciones. No reenvía cookies, tokens ni cabeceras de la petición del navegador a Discord.

| Estado | Significado |
|---|---|
| `200` | Bytes de la imagen, con `Content-Type: image/png` o `image/gif`, `Cache-Control: public, max-age=3600` y `X-Content-Type-Options: nosniff`. |
| `400` | Identificadores inválidos; no se consulta Discord. |
| `502` | Error de red, timeout, redirección, estado remoto no exitoso (incluido 404), cuerpo vacío, tipo inesperado o exceso de tamaño. |
| `503` | Ya existen 16 descargas distintas pendientes y se solicita otra imagen que no está en caché. |

Los errores anteriores usan `Cache-Control: no-store` y texto de estado HTTP mediante `sendStatus`, sin un DTO JSON ni detalles de Discord. No se almacenan en la caché del proxy.

## Caché y límites

| Límite | Comportamiento |
|---|---|
| Caducidad | Una hora desde la descarga; purga de entradas caducadas al atender peticiones válidas. |
| Almacenamiento | Memoria de cada instancia de la aplicación; se pierde al reiniciar y no se comparte entre procesos. No utiliza disco ni base de datos. |
| Capacidad | Hasta 256 imágenes y 32 MiB de bytes de imágenes en caché. Se expulsan las entradas más antiguas por orden de inserción; leer una entrada no renueva su posición ni caducidad. |
| Descarga | Máximo 2 MiB por imagen, comprobando tanto `Content-Length` como los bytes recibidos. Se cancela el lector al superar el límite. |
| Tiempo | Señal de cancelación de 5 segundos para la solicitud remota. |
| Concurrencia | Hasta 16 descargas distintas pendientes. Las peticiones del mismo avatar comparten la descarga; las imágenes ya almacenadas siguen disponibles. La capacidad se libera también al fallar. |

El límite de 32 MiB cubre los cuerpos almacenados, no toda la memoria del proceso ni los buffers de las descargas en curso. Estos límites no constituyen una cuota por usuario ni un límite de peticiones por segundo.

## Integración y despliegue

`AuthControlsView` genera `/api/v1/discord-avatars/{discordId}/{hash}`, codificando ambos segmentos con `encodeURIComponent`. El navegador carga la imagen mediante `<img>`; la elección de PNG/GIF se realiza en el servidor. Sin `avatarHash`, la vista muestra iniciales. Actualmente las iniciales no se activan automáticamente si una descarga falla.

En desarrollo, Vite ya redirige `/api` al backend. En producción, el mismo origen de la web debe enrutar `/api/v1/discord-avatars/` hacia la API y el backend necesita acceso HTTPS saliente a `cdn.discordapp.com`. No se necesitan variables de entorno nuevas, migraciones ni credenciales de bot. Desplegar tanto API como frontend para aplicar el cambio.

El alcance es el avatar de la cuenta mostrado por `AuthControlsView`. No transforma automáticamente otras URLs de Discord, como los campos de avatar generados por el módulo de sugerencias.

## Comprobación en el navegador

1. Iniciar sesión con una cuenta que tenga avatar y recargar con la pestaña Network abierta.
2. Comprobar que la imagen se solicita a `/api/v1/discord-avatars/…` en el origen de la web y que su respuesta no incluye `Set-Cookie` de Discord.
3. Comprobar un avatar animado y una cuenta sin avatar; esta última debe mostrar iniciales sin solicitar la imagen.
4. Repetir la auditoría. El avatar de la cuenta ya no debe generar una solicitud directa a `cdn.discordapp.com`; otras imágenes externas, si existen, pueden producir sus propios avisos.
