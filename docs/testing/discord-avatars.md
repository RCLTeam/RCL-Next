# Pruebas del proxy de avatares

[Índice de pruebas](README.md) · [Contrato y límites del proxy](../api/auth/avatars.md)

Las pruebas utilizan respuestas simuladas de Discord y no necesitan conexión al CDN, una cuenta real ni credenciales OAuth.

| Archivo | Cobertura del cambio |
|---|---|
| `apps/api/src/modules/auth/discord-avatars.router.test.ts` | 19 casos del proxy: bytes y cabeceras, ausencia de cookies reenviadas, PNG/GIF, identificadores inválidos, caché y caducidad, expulsión por cantidad y memoria, concurrencia y recuperación, errores remotos, cuerpos vacíos o de tipo incorrecto, tamaño declarado y cancelación por tamaño real. |
| `tests/integration/api.test.ts` | Comprueba que `createApp` monta la ruta pública sin configurar OAuth, devuelve la imagen y la cabecera de caché y no transmite `Set-Cookie` de Discord. |
| `tests/unit/render/AuthControls.test.tsx` | Comprueba que los avatares estáticos y animados usan la URL del proxy y conservan su texto alternativo; sin avatar, se muestran iniciales y no se genera una imagen. `AccountAvatarView` muestra iniciales cuando la descarga ha fallado y conecta el evento `error` del `<img>` con su manejador. |

## Ejecución

Desde la raíz de `RCL Next`, para ejecutar las tres suites implicadas:

```powershell
pnpm build:packages
pnpm exec vitest run apps/api/src/modules/auth/discord-avatars.router.test.ts tests/integration/api.test.ts tests/unit/render/AuthControls.test.tsx
```

Para comprobar tipos, formato y toda la suite TypeScript:

```powershell
pnpm check
```

La ejecución del 4 de octubre de 2026 tras ampliar estas pruebas terminó con **90 archivos y 1014 pruebas correctas**, además de tipos y formato sin errores. Es un resultado de esa ejecución, no un recuento permanente ni una medida de cobertura de código. La ampliación añadió 12 casos a las pruebas existentes. No incluye las pruebas Python del parser.

Las pruebas con respuestas simuladas no verifican la disponibilidad real del CDN ni el resultado de una auditoría del navegador. La comprobación manual se describe en la [guía del proxy](../api/auth/avatars.md#comprobación-en-el-navegador).
