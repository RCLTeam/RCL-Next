# Persistencia y Almacenamiento en Disco: Team Logos

[⬅️ Volver a Rutas](routes.md) | [Siguiente: Contratos ➡️](contracts.md)

---

## 1. Arquitectura de Almacenamiento Desacoplado

La persistencia del módulo `apps/api/src/modules/team-logos/` opera mediante un modelo desacoplado que separa el almacenamiento de flujos binarios pesados de la gestión transaccional relacional en PostgreSQL.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Arquitectura de Persistencia                    │
│                                                                        │
│   POST /api/v1/team-logos/admin/:name                                  │
│                   │                                                    │
│                   ▼                                                    │
│        [ TeamLogosStore.save ]                                         │
│        - Regex & Magic Bytes Check                                     │
│        - fs.writeFile(..., { flag: 'wx' })                             │
│                   │                                                    │
│                   ▼                                                    │
│        Sistema de Archivos Local                                       │
│        (TEAM_LOGO_DIR / web/public/images/teams_logo/)                 │
│        ├── AKL.webp                                                    │
│        ├── KOI.png                                                     │
│        └── placeholder.webp (Inmutable)                                │
│                   │                                                    │
│                   ▼ Retorna URL canónica                               │
│        { url: "/api/v1/team-logos/images/AKL.webp" }                   │
│                   │                                                    │
│                   ▼ PUT /api/v1/crud-operations/teams/:id              │
│        PostgreSQL: tabla `teams`                                       │
│        └── columna `logo_url` = text                                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Justificación Técnica frente a BLOBs en Base de Datos
1. **Rendimiento y Saturación del Pool de Conexiones:** Servir imágenes estáticas a través de consultas SQL saturaría las conexiones de PostgreSQL (`pg` pool) y aumentaría innecesariamente el consumo de memoria compartida (*shared buffers*). El servicio en disco permite delegar la entrega a la llamada de sistema `sendfile` del kernel de Node.js / Linux.
2. **Copias de Seguridad Ligeras y Rápidas:** Las tablas relacionales se mantienen compactas, permitiendo que las operaciones de volcado y restauración (`pg_dump`, `COPY` streaming en `apps/api/src/modules/database-transfer/`) operen en fracciones de segundo sin transferir gigabytes de datos multimedia.
3. **Persistencia de Referencias en Esquema Relacional:** La tabla `teams` (`packages/database/src/schema.ts:183-205`) almacena únicamente la ruta URL en la columna `logoUrl: text('logo_url')` (`schema.ts:190`). El enlace entre el equipo y su imagen es una cadena URL relativa o externa, sin dependencias foráneas directas sobre el sistema de archivos.

---

## 2. Configuración y Resolución Jerárquica de Directorios

La clase `TeamLogosStore` (`apps/api/src/modules/team-logos/team-logos.store.ts:6-90`) gestiona el ciclo de vida de los archivos en disco. Su constructor resuelve la ruta base mediante la siguiente precedencia (`team-logos.store.ts:7-11`):

```typescript
// apps/api/src/modules/team-logos/team-logos.store.ts:7-11
constructor(
  private readonly directory = fileURLToPath(
    new URL('../../../../web/public/images/teams_logo/', import.meta.url)
  )
) {}
```

1. **Inyección en Servidor (`server.ts:75`):** `createApp` recibe `teamLogoDirectory: env.TEAM_LOGO_DIR`, ya validada por `parseEnvironment`. Si está definida la variable de entorno, se utiliza dicha ruta absoluta o relativa en el sistema; el almacén no lee `process.env`.
2. **Definición en Entorno (`.env.example:23-24`):**
   ```bash
   # TEAM_LOGO_DIR=/persistent/team-logos
   ```
3. **Ruta por Defecto en Desarrollo:** Si no se define `TEAM_LOGO_DIR`, el almacén calcula la ruta física hacia `apps/web/public/images/teams_logo/` usando `import.meta.url`. Esto permite que durante el desarrollo en local los archivos subidos estén inmediatamente accesibles tanto por la API como por el servidor de desarrollo de Vite.

---

## 3. Validación Perimetral y Mitigación de Salto de Directorio

El método `path(name: string)` (`team-logos.store.ts:12-20`) valida y resuelve la ruta física de cualquier archivo solicitado:

```typescript
// apps/api/src/modules/team-logos/team-logos.store.ts:12-20
path(name: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}\.(png|jpe?g|webp)$/.test(name))
    throw new AppError(
      422,
      'INVALID_LOGO_NAME',
      'Usa un nombre con letras, números, guiones y extensión PNG, JPEG o WebP.'
    );
  return resolve(this.directory, name);
}
```

### Anatomía de la Expresión Regular
- `^[a-zA-Z0-9]`: Obliga a que el nombre inicie con un carácter alfanumérico. Prohíbe de forma tajante caracteres de prefijo como `.`, `/`, `\`, guiones o espacios.
- `[a-zA-Z0-9_-]{0,100}`: Permite entre 0 y 100 caracteres intermedios alfanuméricos, guiones bajos (`_`) o guiones medios (`-`).
- `\.(png|jpe?g|webp)$`: Exige que el archivo finalice con un punto seguido estrictamente de una de las extensiones autorizadas: `png`, `jpg`, `jpeg` o `webp`.

### Vectores de Ataque Mitigados
- **Salto de Directorio (*Path Traversal*):** Cargas útiles como `../outside.png`, `../../etc/passwd.png` o `folder/logo.webp` no superan la expresión regular al contener barras (`/` o `\`) o puntos sucesivos (`..`), lanzando HTTP 422 `INVALID_LOGO_NAME`.
- **Inyección de Bytes Nulos (*Null Byte Injection*):** Secuencias como `logo.png\0.exe` son invalidadas de inmediato por el conjunto de caracteres estrictamente alfanumérico.
- **Nombres Excesivamente Largos (*Buffer Overflow / DoS*):** La restricción `{0,100}` limita la longitud del nombre a un máximo seguro para cualquier sistema de archivos (ext4, NTFS, APFS).

---

## 4. Inmunidad contra Enlaces Simbólicos y Fugas de Almacenamiento

Al leer o desvincular un archivo en el método `file(name: string)` (`team-logos.store.ts:22-30`), el sistema no confía ciegamente en la ruta calculada:

```typescript
// apps/api/src/modules/team-logos/team-logos.store.ts:22-30
async file(name: string) {
  const path = this.path(name);
  const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw notFound('Logo');
    throw error;
  });
  if (!stat.isFile() || stat.isSymbolicLink()) throw notFound('Logo');
  return path;
}
```

1. **Uso de `lstat` en lugar de `stat`:** La llamada a `lstat` inspecciona los atributos del propio nodo de inodo sin seguir ni desreferenciar enlaces simbólicos (*symlinks*).
2. **Rechazo de Enlaces Simbólicos:** Si un atacante lograse colocar un enlace simbólico en el directorio apuntando a un archivo confidencial del sistema operativo (ej. `/etc/shadow`), la comprobación `stat.isSymbolicLink()` evalúa a `true`, abortando de inmediato con `notFound('Logo')` (HTTP 404).
3. **Rechazo de Directorios y Nodos Especiales:** La condición `!stat.isFile()` garantiza que subdirectorios, sockets UNIX o tuberías nombradas jamás se entreguen ni se eliminen como si fuesen archivos de imagen.

---

## 5. Concurrencia y Escrituras Atómicas en Disco (`flag: 'wx'`)

Durante la subida de insignias, el método `save` (`team-logos.store.ts:44-75`) persiste el archivo utilizando la bandera POSIX `wx` (`team-logos.store.ts:68`):

```typescript
// apps/api/src/modules/team-logos/team-logos.store.ts:66-73
await mkdir(this.directory, { recursive: true });
try {
  await writeFile(path, body, { flag: 'wx' });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EEXIST')
    throw new AppError(409, 'LOGO_EXISTS', 'Ya existe un logo con ese nombre.');
  throw error;
}
```

### Garantía Atómica a Nivel de Kernel
- La bandera `wx` equivale a las banderas POSIX `O_CREAT | O_EXCL` en la llamada al sistema `open()`.
- **Exclusión Mutua Atómica:** El kernel del sistema operativo asegura que el archivo se cree únicamente si no existe previamente. Esta verificación y creación ocurren como una operación atómica indivisible.
- **Eliminación de Condiciones de Carrera (*TOCTOU - Time of Check to Time of Use*):** No existe un paso previo vulnerable de tipo `fs.existsSync(path)` antes de escribir. Si dos peticiones concurrentes intentan guardar un logo con el mismo nombre en el mismo milisegundo, una triunfa y la otra falla atómicamente con `EEXIST`, traduciéndose de forma limpia a HTTP 409 `LOGO_EXISTS`.

---

## 6. Inspección de Bytes Mágicos y Techo de Carga Útil

El método `save` protege al servidor frente a archivos maliciosos camuflados o cargas sobredimensionadas mediante validación combinada de tamaño, tipo y cabecera binaria (`team-logos.store.ts:47-65`):

```typescript
// apps/api/src/modules/team-logos/team-logos.store.ts:47-59
if (!Buffer.isBuffer(body) || !body.length || body.length > 5 * 1024 * 1024)
  throw new AppError(422, 'INVALID_IMAGE', 'Selecciona una imagen de hasta 5 MB.');
const valid =
  (name.endsWith('.png') &&
    type === 'image/png' &&
    body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
  (/\.jpe?g$/.test(name) &&
    type === 'image/jpeg' &&
    body.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) ||
  (name.endsWith('.webp') &&
    type === 'image/webp' &&
    body.toString('ascii', 0, 4) === 'RIFF' &&
    body.toString('ascii', 8, 12) === 'WEBP');
if (!valid)
  throw new AppError(
    422,
    'INVALID_IMAGE',
    'El contenido y la extensión deben corresponder a una imagen PNG, JPEG o WebP.'
  );
```

### Matriz de Verificación de Formatos Autorizados

| Formato | Extensión Requerida | Cabecera `Content-Type` | Firma Binaria (*Magic Bytes*) | Desplazamiento (*Offset*) |
|---|---|---|---|:---:|
| **PNG** | `.png` | `image/png` | `89 50 4E 47 0D 0A 1A 0A` | Bytes `0..7` (8 bytes) |
| **JPEG** | `.jpg` o `.jpeg` | `image/jpeg` | `FF D8 FF` | Bytes `0..2` (3 bytes) |
| **WebP** | `.webp` | `image/webp` | Contenedor `RIFF` (`52 49 46 46`)<br>Firma `WEBP` (`57 45 42 50`) | Bytes `0..3`<br>Bytes `8..11` |

Si cualquiera de estos componentes no coincide (por ejemplo, un archivo con extensión `.webp` pero con bytes de PNG, o un archivo HTML con cabecera `image/png`), el sistema aborta arrojando `AppError(422, 'INVALID_IMAGE')`.

---

## 7. Protección de Inmutabilidad del Logo de Reserva (`placeholder.webp`)

Para garantizar que los equipos que no cuenten con un escudo personalizado siempre dispongan de un identificador visual funcional, el sistema incorpora la regla de inmutabilidad `assertMutable` (`team-logos.store.ts:82-89`):

```typescript
// apps/api/src/modules/team-logos/team-logos.store.ts:82-89
private assertMutable(name: string) {
  if (name.toLowerCase() === 'placeholder.webp')
    throw new AppError(
      403,
      'PROTECTED_LOGO',
      'El logo de reserva está protegido y no se puede modificar ni eliminar.'
    );
}
```

1. **Evaluación Insensible a Mayúsculas:** La comprobación `name.toLowerCase() === 'placeholder.webp'` impide eludir la protección utilizando variantes como `PLACEHOLDER.webp`, `Placeholder.Webp` o `pLaCeHoLdEr.WEBP`.
2. **Aplicación Universal:** `assertMutable` se invoca obligatoriamente al inicio tanto de `save(name, ...)` como de `remove(name)`, bloqueando tanto la sobrescritura como el borrado con HTTP 403 `PROTECTED_LOGO`.
3. **Custodia en Control de Versiones:** La directiva `.gitignore` del repositorio (`.gitignore:15-18`) excluye el directorio dinámico pero declara una excepción explícita para preservar el archivo canónico:
   ```gitignore
   /apps/web/public/images/teams_logo/*
   !/apps/web/public/images/teams_logo/placeholder.webp
   ```
