# Administración de la competición

`/admin` es la entrada protegida para `admin` y `owner`. Tiene cuatro subpáginas:

- `/admin/rofl/upload`: importación de repeticiones y estadísticas con el flujo ROFL existente.
- `/admin/crud`: consulta, creación, edición y eliminación. Un selector cambia la entidad dentro de esta misma página.
- `/admin/member-roles`: listado de miembros y gestión de sus roles. Los administradores solo pueden consultar; únicamente un `owner` puede cambiar roles.
- `/admin/database-transfer`: exportar backups PostgreSQL `.dump` como admin u owner, e importar datos como owner.

## Orden habitual de configuración

1. Crear la temporada y las divisiones; vincularlas desde **Competiciones**.
2. Crear los equipos de cada competición.
3. Asociar identidades Discord existentes a sus cuentas Riot desde **Jugadores**.
4. Asignar los miembros a equipos desde **Plantillas**, indicando rol y capitanía.
5. Crear las jornadas de cada competición. Los encuentros se gestionan fuera del CRUD.
6. Importar los ROFL desde la otra subpágina.

La pantalla permite buscar y recorrer listados de 50 registros. Los selectores de relaciones también tienen búsqueda y carga de más opciones. Las identidades Discord se consultan únicamente como referencias para jugadores y plantillas. Las fechas y horas se muestran en la zona horaria del navegador y se envían con zona horaria a la API.

## Reglas de edición

- Las claves naturales (nombre de temporada/división, ID Discord) y las claves compuestas de jornadas y plantillas no cambian al editar. Para trasladar una inscripción de plantilla, elimina la anterior y crea la nueva; ambas acciones quedan registradas.
- Las temporadas no tienen estado activo. El selector público usa por defecto la fecha de inicio más reciente; las temporadas sin fecha quedan al final y los empates se ordenan por nombre. El usuario puede elegir otra temporada.
- Solo puede existir un capitán por equipo y debe ocupar un rol de jugador titular.
- Una competición o equipo con datos dependientes no puede cambiar de ámbito.
- Encuentros y Miembros no aparecen en el selector ni admiten operaciones CRUD. Sus tablas y datos se conservan; ROFL sigue funcionando.
- Un borrado requiere confirmación en un pop-up. Para `admin`, se rechaza si existen dependencias. Un `owner` puede confirmar la eliminación de las relaciones `ON DELETE CASCADE`, incluidos encuentros y snapshots ROFL dependientes; estos no se editan individualmente desde el CRUD. Las sesiones y permisos no forman parte del CRUD.
- Si otro administrador o ROFL modifica un registro mientras está abierto, guardar o eliminar devuelve un conflicto. **Recargar datos** descarta el formulario abierto y recupera la versión vigente.

## Organización y persistencia

`apps/api/src/modules/crud-operations/` separa catálogo/validación, servicio, rutas e implementación PostgreSQL. `apps/web/src/features/crud-operations/` agrupa cliente HTTP, formularios, selección de entidad y listados; `site/pages/admin/` compone las subpáginas. Los contratos públicos están en `packages/contracts/src/crud-operations.ts`.

Cada escritura y su `audit_logs` se ejecutan en una transacción. Los cambios de plantilla también generan `roster_movements`. Las ediciones y los borrados bloquean el registro y comparan su `updatedAt` con precisión de microsegundos, compatible con los bloqueos de encuentro del importador ROFL. No cambia el esquema ni las migraciones existentes.

Todas las rutas CRUD requieren sesión Discord y rol `admin` u `owner`; las escrituras exigen el `Origin` configurado. Los miembros existentes se consultan únicamente mediante GET /references/users; no se crean, editan ni eliminan desde este módulo. La administración devuelve 503 si no está configurada la autenticación o el repositorio.

Las pruebas de integración HTTP/PGlite están en `tests/integration/crud-operations.test.ts`; cubren autenticación, origen, CRUD, auditoría, relaciones, resultados importados, edición obsoleta y paginación. Las pruebas no escriben en la base de desarrollo.

## Gestión de roles

`member-roles` es un módulo independiente de CRUD Operations, con su propio cliente HTTP, componentes, servicio y repositorio. Lista identidades Discord ya registradas, con búsqueda por usuario, nombre o ID y páginas de 50 miembros. No crea ni elimina miembros.

| Rol | ROFL y CRUD | Consultar miembros | Cambiar roles |
| --- | --- | --- | --- |
| `viewer` | No | No | No |
| `admin` | Sí | Sí | No |
| `owner` | Sí | Sí | Sí |

Un owner selecciona `viewer`, `admin` u `owner` y confirma el cambio. La API comprueba el permiso persistido dentro de la misma transacción que la escritura y su auditoría. Rechaza ediciones obsoletas y retirar el último owner; para transferir la propiedad, primero asigna otro owner. Los permisos HTTP se consultan en cada petición. ROFL los verifica al conectar, antes de procesar y antes de guardar.

El enum `app_role` incluye `owner` en el esquema inicial, Drizzle y snapshot; no se añade una migración incremental. No se asigna owner automáticamente a ninguna cuenta. Por decisión del proyecto, el owner inicial queda pendiente de designación; mientras no exista, los administradores solo podrán consultar esta función. El login y el seed no promocionan cuentas.

Las pruebas HTTP/PGlite de permisos, cambios, auditoría y paginación están en `tests/integration/member-roles.test.ts`.

## Borrado en cascada para owner

Si un administrador intenta eliminar un registro con referencias, el pop-up conserva el bloqueo y muestra todas las entidades directamente relacionadas, únicamente mediante etiquetas públicas y cantidades. La API no consulta ni devuelve ejemplos, claves, nombres de registros ni nombres internos de tablas. No cuenta dos veces un registro que referencia la entidad mediante varias claves foráneas. Esta información no concede permisos de borrado en cascada.

Al pulsar **Eliminar**, el owner recibe una previsualización con las tablas, el número exacto de filas y hasta cinco ejemplos de claves por tabla. También se distinguen las filas que solo se desvincularán (`SET NULL`) y las referencias protegidas que bloquean el borrado. Para confirmar debe marcar la casilla de aceptación. Cancelar o cerrar el diálogo no elimina nada.

La API vuelve a comprobar el rol persistido y recalcula el alcance dentro de la transacción de borrado. La confirmación identifica el contenido revisado: si cambia el registro o cualquiera de sus dependencias, debe abrirse otra previsualización. El recorrido sigue únicamente relaciones `CASCADE`; no convierte `RESTRICT` ni restricciones de nulabilidad en cascadas. Las claves compuestas y las filas alcanzadas por más de una relación se contabilizan una sola vez.

La previsualización y el borrado bloquean temporalmente las escrituras en las tablas del esquema para estabilizar el cálculo; si otra operación está escribiendo, devuelven conflicto para reintentar. No mantienen bloqueos mientras se lee el pop-up. Se limita cada recorrido a 10000 filas para acotar la operación. Los dependientes se eliminan antes que sus padres respetando las restricciones y se registra el alcance confirmado en `audit_logs`; un fallo revierte toda la transacción. No se cambian el esquema ni las migraciones.

## Importación y exportación PostgreSQL

**Database Transfer** mantiene el patrón `features/database-transfer` en web, `modules/database-transfer` en API y contratos compartidos. La API necesita `pg_dump` y `pg_restore` compatibles con la versión del servidor, disponibles en PATH o en `POSTGRES_BIN_DIR`. Tras cambiar esta configuración, reinicia la API.

Cualquier admin u owner puede descargar un backup nativo de formato personalizado (`pg_dump -Fc`), con el esquema y datos de `public` y el historial `drizzle`. El archivo incluye miembros, roles y sesiones; debe guardarse como copia privada. No incluye las credenciales de conexión ni la configuración del servidor PostgreSQL.

Solo un owner puede seleccionar un `.dump`, validarlo y confirmar escribiendo **IMPORTAR**. La validación muestra filas actuales y filas del archivo por tabla y ensaya la restauración dentro de una transacción que se revierte. El archivo debe contener las 21 tablas completas, sus columnas actuales y un historial de migraciones coincidente. Los dumps generados con INSERT en lugar de COPY, parciales o de otro esquema se rechazan.

La importación web **reemplaza los datos y conserva el esquema instalado**: `pg_restore` extrae los bloques COPY del archivo; la API valida y carga esos datos con consultas parametrizadas. No ejecuta funciones, triggers, permisos, comandos SQL ni comandos de shell contenidos en el backup. El archivo exportado sigue siendo un `.dump` estándar que puede utilizarse con las herramientas PostgreSQL fuera de la aplicación.

Al confirmar, se comprueba de nuevo el rol owner y que ni el archivo ni los datos actuales hayan cambiado desde la revisión. Reemplazo, comprobación de restricciones y auditoría se confirman en una sola transacción. Un fallo conserva la base anterior. La cuenta del owner que importa se conserva con ese rol, aunque no figure en el archivo. Se invalidan todas las sesiones y estados OAuth, incluidos los importados: hay que volver a iniciar sesión tras restaurar.

El límite web es de 64 MiB por `.dump`, 128 MiB para su extracción y 64 MiB para la instantánea de validación de la base actual. Las herramientas tienen un plazo máximo de tres minutos. Se procesa una transferencia a la vez por instancia API; durante la validación y restauración se bloquean las tablas brevemente, pero no mientras el usuario revisa el diálogo. No se añaden migraciones ni se asigna un owner inicial.

## Contenido de la home

En `/admin/home-content`, admins y owners pueden gestionar:

- **Team of the Week**: selecciona temporada, división y jornada; elige cinco jugadores de las partidas importadas; todos sus campeones se incorporan automáticamente. Guarda como borrador o publica. Cada jornada conserva su quinteto independiente. Desmarca «Publicado» para retirarlo sin perder los datos.
- **Editorial**: crea, edita y elimina noticias, entrevistas, reportajes u otros temas. Cada artículo tiene título, subtítulo opcional, autor, contenido e portada opcional desde un archivo con descripción accesible. La vista previa muestra el contenido antes de guardar. Separa párrafos con líneas en blanco; `## ` crea subtítulos y `> ` citas. El HTML se trata como texto.
- **Selección de portada**: «Publicado» permite leer el artículo; «Mostrar en la editorial de la home» decide si aparece en la home. El menor orden ocupa la tarjeta destacada. Los borradores nunca se sirven al público, incluso con su enlace directo.

Los enlaces de editorial abren una ventana emergente compacta con desplazamiento interno, cierre con botón o Escape y URL propia `/editorial/:id`. La home incorpora el selector de división encima del quinteto.

El esquema inicial `0000_initial_schema.sql` incluye `home_weekly_teams` y `editorial_articles`, con quintetos por división y jornada. Ejecuta `pnpm db:migrate` para inicializar una base vacía. Las escrituras mantienen la autenticación, comprobación de origen y registro de auditoría de la administración.


### Quintetos por jornada

Cada división conserva ahora un quinteto independiente por jornada. En **Home content → Team of the Week**, selecciona temporada, división y jornada; después elige los cinco jugadores; los campeones usados por cada jugador se obtienen automáticamente. Los candidatos se obtienen de las partidas importadas, aunque su plantilla actual haya cambiado. Si no aparecen jugadores, primero hay que importar los ROFL de esa jornada.

La home muestra únicamente jornadas con quintetos publicados y abre por defecto la más reciente. Despublicar una jornada la retira del selector sin borrar su quinteto. Las tarjetas alternan los splash arts de todos los campeones de la jornada con un fundido cada 4,5 segundos (imagen fija con un solo campeón o preferencia de movimiento reducido), con texto legible y fondo alternativo si la imagen no se puede cargar.

Los quintetos locales anteriores sin jornada se conservan sin asignarles una automáticamente. Permanecen visibles como referencia en admin, pero quedan fuera del selector público hasta que se confirmen para una jornada real. Las imágenes manuales antiguas se conservan en esos registros; los quintetos por jornada usan todos los campeones registrados.

### Imágenes de editorial

La portada se selecciona desde un archivo PNG, JPEG o WebP (máximo 5 MiB). Puede sustituirse o quitarse. Para insertar imágenes en la noticia, coloca el cursor en el contenido, escribe la descripción y selecciona el archivo en «Insertar imagen en el contenido». El editor inserta un bloque `![descripción](ruta)` que puedes mover o eliminar; la vista previa y la noticia muestran la imagen con su pie.

Las subidas requieren sesión admin/owner y origen autorizado. La API comprueba tipo, firma y tamaño. Los archivos se guardan en `EDITORIAL_IMAGE_DIR` (por defecto `data/editorial-images`, relativo al directorio de ejecución de la API). En despliegues usa un volumen persistente y compartido si hay varias instancias. Incluye esta carpeta en las copias de seguridad: el backup PostgreSQL conserva las referencias, no los archivos. Las imágenes tienen rutas públicas aleatorias desde su subida y se eliminan al guardar si se han retirado de la portada o del contenido y ninguna otra noticia o borrador las utiliza. Borrar una noticia también limpia sus imágenes no compartidas. Las imágenes subidas y retiradas durante una edición se limpian al guardar esa edición; cancelar una edición sin guardar no realiza esa limpieza.
