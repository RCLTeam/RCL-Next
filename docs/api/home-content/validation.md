# Validación y Manejo de Errores: Editorial Home Content

[⬅️ Volver a Persistencia](persistence.md) | [Siguiente: Contratos ➡️](contracts.md)

---

## 1. Visión General de Validación

El módulo editorial aplica una estrategia de validación en tres capas defensivas:
1. **Validación Sintáctica Temprana (Zod Schemas):** En `home-content.service.ts`, todas las cargas útiles HTTP entrantes se analizan con esquemas Zod dotados de modificadores `.strict()`, descartando propiedades no reconocidas y validando tipos primitivos, longitudes y expresiones regulares.
2. **Validación de Integridad Física (Sniffing de Cabeceras):** En `editorial-image.store.ts`, los archivos binarios de imagen se inspeccionan a nivel de bytes mágicos antes de su escritura en disco.
3. **Validación de Reglas de Dominio y Negocio (Fail-Fast):** En `postgres-home-content.repository.ts`, se verifica la elegibilidad deportiva de los jugadores seleccionados en los quintetos y la unicidad de sus asignaciones.

---

## 2. Esquemas de Validación Zod (`home-content.service.ts`)

### 2.1 Esquema de URL de Imagen (`imageUrl`, líneas 6-14)
Valida cualquier referencia a recursos gráficos para portadas o fotos de jugadores:

```typescript
// home-content.service.ts:6-14
const imageUrl = z.union([
  z.literal(''),
  z.string().regex(/^\/api\/v1\/home-content\/images\/[a-f0-9-]{36}\.(png|jpg|webp)$/),
  z
    .string()
    .url()
    .max(2000)
    .refine((url) => url.startsWith('https://'), 'Images must use HTTPS.')
]);
```
- **Cadena Vacía:** Admite `""` para indicar ausencia de imagen.
- **Ruta Interna Canónica:** Acepta exclusivamente URLs servidas por la propia API bajo el formato `/api/v1/home-content/images/<uuid>.<ext>`, garantizando que el identificador corresponda a un UUID v4 seguro.
- **URL Externa Segura:** Si es externa, debe ser una URL válida de hasta 2.000 caracteres que utilice obligatoriamente el protocolo seguro `https://`. Protocolos inseguros (`http://`, `ftp://`) o esquemas de script (`javascript:`, `data:`) son rechazados.

---

### 2.2 Esquema de Entrada de Artículo (`articleInput`, líneas 15-36)

```typescript
// home-content.service.ts:15-36
const articleInput = z
  .object({
    title: z.string().trim().min(1).max(180),
    excerpt: z.string().trim().max(500),
    body: z.string().trim().min(1).max(100000),
    kind: z.enum(['noticia', 'reportaje', 'entrevista', 'otro']),
    author: z.string().trim().min(1).max(120),
    coverUrl: imageUrl,
    coverAlt: z.string().trim().max(240),
    published: z.boolean(),
    showOnHome: z.boolean(),
    homeOrder: z.number().int().min(0).max(9999),
    uploadedImages: z
      .array(z.string().regex(/^\/api\/v1\/home-content\/images\/[a-f0-9-]{36}\.(png|jpg|webp)$/))
      .max(100)
      .default([])
  })
  .strict()
  .refine(
    (article) => !article.coverUrl || article.coverAlt.length > 0,
    'Cover images require alternative text.'
  );
```

#### Reglas de Validación:
- **`title`:** Cadena de texto de 1 a 180 caracteres tras recortar espacios en blanco.
- **`excerpt`:** Resumen o entradilla de hasta 500 caracteres (admite cadena vacía).
- **`body`:** Cuerpo completo del artículo en texto/markdown, con un tamaño mínimo de 1 carácter y un límite máximo de 100.000 caracteres (~15.000 palabras).
- **`kind`:** Enumerado estricto: `'noticia'`, `'reportaje'`, `'entrevista'`, `'otro'`.
- **`author`:** Firma del redactor de 1 a 120 caracteres.
- **`coverAlt` y Refinamiento de Accesibilidad:** Si `coverUrl` no está vacío, `coverAlt` debe contener obligatoriamente al menos un carácter (`!article.coverUrl || article.coverAlt.length > 0`). Se prohíben portadas huérfanas sin texto alternativo accesible.
- **`homeOrder`:** Entero positivo entre 0 y 9.999.
- **`uploadedImages`:** Lista de hasta 100 imágenes subidas durante la sesión de edición para su seguimiento en el recolector de basura.
- **`.strict()`:** Cualquier campo inesperado en la carga útil HTTP genera un error 422 inmediato.

---

### 2.3 Esquema de Entrada de Quinteto Ideal (`teamInput`, líneas 37-62)

```typescript
// home-content.service.ts:37-62
const teamInput = z
  .object({
    roundId: z.number().int().min(1).max(32767),
    label: z.string().trim().min(1).max(120),
    published: z.boolean(),
    players: z
      .array(
        z
          .object({
            role: z.enum(['top', 'jungle', 'mid', 'adc', 'support']),
            name: z.string().trim().min(1).max(80),
            team: z.string().trim().min(1).max(120),
            imageUrl,
            playerId: z.string().uuid(),
            teamId: z.string().uuid(),
            champions: z.array(z.string().max(64)).default([])
          })
          .strict()
      )
      .length(5)
  })
  .strict()
  .refine(
    (team) => new Set(team.players.map((player) => player.role)).size === 5,
    'Choose one player per role.'
  );
```

#### Reglas de Validación:
- **`roundId`:** Entero en el rango de `smallint` (1 a 32.767).
- **`players`:** Longitud fija de exactamente 5 elementos (`.length(5)`).
- **Unicidad de Roles:** El conjunto de roles debe tener exactamente 5 elementos distintos (`new Set(...).size === 5`), forzando que exista exactamente un `top`, un `jungle`, un `mid`, un `adc` y un `support`.
- **Identificadores UUID:** Cada jugador debe asociar `playerId` y `teamId` en formato UUID estándar v4.

---

## 3. Validación de Autorización y Origen Confiable

### Control de Acceso por Roles
En `home-content.router.ts:34`:
```typescript
router.use('/admin', requireAuth(auth, 'admin'));
```
- Valida la sesión activa del usuario frente al middleware de autenticación (`requireAuth`).
- Exige que `user.role` sea `'admin'` u `'owner'`. La invocación con `'admin'` valida automáticamente ambos roles jerárquicos (`auth.router.ts:25`).
- **Refutación:** Peticiones realizadas por usuarios anónimos devuelven **HTTP 401**. Peticiones de usuarios autenticados con rol `'viewer'` devuelven **HTTP 403**.

### Guardia de Origen Confiable (CSRF Guard)
En `home-content.router.ts:47`:
```typescript
router.use('/admin', requireTrustedOrigin(auth.frontendOrigin));
```
- Para cualquier método no seguro (`POST`, `PUT`, `DELETE`), verifica que la cabecera `Origin` coincida con la URL del frontend autorizada (`auth.frontendOrigin`). Peticiones de origen cruzado son denegadas con **HTTP 403**.

---

## 4. Validaciones de Dominio en Repositorio

| Error de Dominio | Código HTTP | Condición Desencadenante | Ubicación |
|---|:---:|---|---|
| `notFound('Division')` | 404 | La división especificada en `:id` no existe en `seasons_divisions`. | `postgres-home-content.repository.ts:235` |
| `notFound('Round')` | 404 | La jornada especificada en `roundId` no pertenece a esa división. | `postgres-home-content.repository.ts:241` |
| `INVALID_WEEKLY_PLAYER` | 422 | El jugador no participó en esa jornada o no jugó en el rol asignado. | `postgres-home-content.repository.ts:253` |
| `DUPLICATE_WEEKLY_PLAYER` | 422 | El mismo jugador (`memberId`) fue asignado a dos posiciones en el mismo quinteto. | `postgres-home-content.repository.ts:260` |
| `INVALID_IMAGE` | 422 | La firma binaria de bytes mágicos no coincide con PNG, JPEG o WebP. | `editorial-image.store.ts:39` |
| `IMAGE_TOO_LARGE` | 413 | El archivo binario de imagen excede 5.242.880 bytes. | `editorial-image.store.ts:24` |
| `notFound('Image')` | 404 | El nombre de imagen no cumple con el formato UUID o no existe en disco. | `editorial-image.store.ts:13, 20` |
| `notFound('Article')` | 404 | El artículo no existe o está en borrador en una consulta pública. | `home-content.service.ts:74`, `postgres-home-content.repository.ts:106` |
