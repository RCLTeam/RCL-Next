# Componentes de Presentación (Dumb UI): Web CRUD Operations

[⬅️ Volver a la Documentación de la Feature](README.md) | [Siguiente: Hooks y Gestión de Estado ➡️](hooks.md)

---

## 1. Resumen de la Capa de Componentes

La capa de componentes de `apps/web/src/features/crud-operations/components/` contiene las vistas, controles de tabla, formularios dinámicos y cuadros de diálogo modales requeridos para interactuar con los recursos administrativos de RCL-Next.

### Certificación de Invariante de Red (Cero Red Directa)
Se certifica que los componentes visuales de este directorio respetan estrictamente la invariante de componentes de presentación:
- **Llamadas a `fetch`:** **0 encontradas**.
- **Instanciaciones de `WebSocket`:** **0 encontradas**.
- **Gestión de Red:** Toda la comunicación HTTP se delega en las funciones exportadas por `../api/crud-operations-api.ts`.

---

## 2. Catálogo de Componentes

### 2.1 Selector de Recursos (`CrudOperationsPanel.tsx`)
- **Cita:** `CrudOperationsPanel.tsx:1-62`
- **Responsabilidad:** Carga el catálogo de recursos disponibles mediante `getCrudResources` al montarse y renderiza la barra de navegación entre entidades (`seasons`, `divisions`, `competitions`, `teams`, `players`, `memberships`, `rounds`, `matches`).
- **Props:** No requiere props obligatorias.
- **Comportamiento:**
  - Gestiona el recurso seleccionado actualmente mediante `useState<CrudResource | null>(null)`.
  - Cuando el catálogo se carga, selecciona por defecto el primer recurso de la lista.
  - Renderiza `<CrudDataPanel resource={selectedResource} />`.

---

### 2.2 Explorador de Registros y Tabla de Datos (`CrudDataPanel.tsx`)
- **Cita:** `CrudDataPanel.tsx:1-284`
- **Responsabilidad:** Proporciona la interfaz interactiva para explorar registros de la tabla seleccionada:
  - Campo de búsqueda textual con icono de lupa.
  - Tabla de datos con cabeceras de columnas (`fields`), formateo de celdas y etiquetas foráneas legibles (`recordLabel`).
  - Barra de paginación con botones `Anterior` y `Siguiente` (`offset` e indicador `hasMore`).
  - Botones de acción por fila: `Editar` (abre `CrudRecordForm`) y `Eliminar` (abre `CrudDeleteDialog`).
  - Botón principal de cabecera: `Crear registro`.
- **Integración con Reordenación de Mapas:** Cuando el recurso activo corresponde a partidos (`resource.name === 'matches'`) y se está editando un registro (`editor.record`), se renderiza condicionalmente el componente `<MatchMapOrderEditor key={String(editor.record.id)} matchId={String(editor.record.id)} busy={busy} onBusy={setBusy} />` directamente encima de `<CrudRecordForm>` (`CrudDataPanel.tsx:137-144`), permitiendo la reordenación visual de los mapas de la serie seleccionada.
- **Props:**
  ```typescript
  interface CrudDataPanelProps {
    resource: CrudResource;
  }
  ```
- **Gestión del Foco:** Utiliza `editorRef = useRef<HTMLDivElement>(null)` para transferir automáticamente el foco al formulario de edición cuando se abre (`CrudDataPanel.tsx:60-61`), asegurando accesibilidad para usuarios de teclado.

---

### 2.3 Formulario Dinámico de Registro (`CrudRecordForm.tsx`)
- **Cita:** `CrudRecordForm.tsx:1-290`
- **Responsabilidad:** Genera dinámicamente los campos de entrada de datos en función de la definición `field.type` del recurso:
  - `'text'`, `'url'`: Elemento `<input type="text">` con límites de longitud `maxLength`.
  - `'number'`: `<input type="number">` respetando rangos `min` y `max`.
  - `'boolean'`: `<input type="checkbox">` estilizado con soporte de switch.
  - `'date'`: `<input type="date">`.
  - `'datetime'`: `<input type="datetime-local">`.
  - `'select'`: Componente accesible `Select` (`apps/web/src/shared/components/Selector/Selector.tsx`) con variante `form` para opciones predefinidas en `field.options`.
  - Campos con `field.reference`: Renderiza el componente accesible `Select` con variante `form` y carga perezosa de opciones foráneas mediante `GET /references/:resource`.
- **Props:**
  ```typescript
  interface CrudRecordFormProps {
    resource: CrudResource;
    record: CrudRecord | null;
    busy: boolean;
    onSave: (values: CrudRecord) => Promise<void>;
    onCancel: () => void;
  }
  ```
- **Consumo del Selector Accesible (`Select`):** Tanto las opciones estáticas (`field.options`) como las foráneas (`field.reference`) se gestionan mediante el componente accesible `Select` configurado con `variant="form"`, proporcionando búsqueda textual diacrítica y soporte completo de teclado.
- **Paginación en Memoria de Referencias (`limit=250`):** En `loadOptions` (`CrudRecordForm.tsx:206-229`), realiza peticiones iterativas con un bucle `while (hasMore && !controller.signal.aborted)` sobre `references/:resource` solicitando 250 registros por página (`limit=250`), poblando el desplegable en memoria para permitir filtrado diacrítico instantáneo en el cliente.
- **Soporte para Identificador de Rol de Discord en Equipos:** Admite el campo `discordRoleId` en el recurso `teams` (cadena de hasta 20 caracteres, nullable, identificador numérico de Discord en formato texto consumido para permisos y visibilidad deportiva).
- **Reseteo en Cascada de Campos Dependientes:** Al modificar `idSeasonDivision` en partidos (`matches`), limpia automáticamente `team1Id`, `team2Id`, `winnerTeamId` e `idRound`; cambiar `team1Id` o `team2Id` limpia automáticamente `winnerTeamId` (`CrudRecordForm.tsx:38-45`), previniendo incoherencias relacionales.
- **Inmutabilidad Visual:** Si `record !== null`, los campos con `field.immutable: true` o pertenecientes a `resource.keys` se renderizan como deshabilitados (`disabled`), impidiendo ediciones inválidas en el cliente.

---

### 2.4 Diálogo Accesible de Borrado en Cascada (`CrudDeleteDialog.tsx`)
- **Cita:** `CrudDeleteDialog.tsx:1-213`
- **Responsabilidad:** Presenta un modal bloqueante accesible que desglosa el impacto de eliminación antes de confirmar el borrado físico de una fila.
- **Props:**
  ```typescript
  interface CrudDeleteDialogProps {
    resource: CrudResource;
    record: CrudRecord;
    owner: boolean;
    busy: boolean;
    onConfirm: (confirmation?: string) => Promise<void>;
    onClose: () => void;
  }
  ```
- **Interacción y Accesibilidad (WAI-ARIA):**
  - Utiliza el elemento nativo `<dialog>` de HTML5 con `ref.current?.showModal()`.
  - Escucha el evento `cancel` (tecla Escape) para invocar `onClose()`.
  - Al abrirse, solicita la previsualización a través de `previewCrudDelete(resource, record, signal)`.
  - **Tabla de Impacto:** Renderiza una tabla con las tablas afectadas, la acción a ejecutar (`delete`, `set-null`, `blocked`), el recuento de filas y ejemplos representativos.
  - **Doble Confirmación para Owners:**
    - Si el usuario no es `owner`, el botón de confirmación permanece bloqueado y se muestra un mensaje explicativo.
    - Si el usuario es `owner` y la operación está permitida (`preview.allowed`), se exige marcar una casilla de verificación obligatoria (`CrudDeleteDialog.tsx:114-122`):
      `"He revisado las tablas y filas afectadas y confirmo su eliminación definitiva."`
    - Solo tras marcar dicha casilla se activa el botón destructivo `Confirmar eliminación en cascada`.

---

### 2.5 Editor Interactivo de Orden de Mapas (`MatchMapOrderEditor.tsx`)
- **Cita:** `apps/web/src/features/crud-operations/components/MatchMapOrderEditor.tsx:1-137`
- **Responsabilidad:** Proporciona un panel administrativo interactivo para reordenar las partidas (`games`) de una serie deportiva sin necesidad de volver a subir los archivos `.rofl`.
- **Props:**
  ```typescript
  interface MatchMapOrderEditorProps {
    matchId: string;
    busy: boolean;
    onBusy: (busy: boolean) => void;
  }
  ```
- **Carga Inicial y Cancelación:** Al montarse o al cambiar `matchId` o `revision`, cancela peticiones en curso con `AbortController` y solicita los mapas actuales con `getMatchMaps(matchId, controller.signal)`. Inicializa los estados `maps: AdminMatchMap[] | null` y `expectedOrder: string[]` con los identificadores originales (`MatchMapOrderEditor.tsx:20-36`).
- **Algoritmo de Movimiento:** Función `move(index, direction)` que clona el array de mapas y reubica la entrada mediante `splice` (`MatchMapOrderEditor.tsx:38-46`).
- **Controles Accesibles:** Botones `↑ Subir` (`move(index, -1)`) y `↓ Bajar` (`move(index, 1)`) con etiquetas `aria-label` descriptivas (`Subir mapa ${index + 1}` y `Bajar mapa ${index + 1}`), deshabilitados en los límites del array (`index === 0` o `index === maps.length - 1`) o cuando la interfaz está ocupada (`busy`).
- **Detección de Cambios (Dirty Tracking):** `const dirty = maps?.some((map, index) => map.id !== expectedOrder[index])`. El botón `Guardar orden` permanece inactivo mientras `!dirty || busy`.
- **Persistencia y Control de Concurrencia Optimista:** Al guardar, bloquea la interfaz con `onBusy(true)` e invoca `saveMatchMapOrder(matchId, { expectedOrder, gameIds })`. Si otro usuario modificó el orden en el servidor, la API devuelve HTTP 409 y se muestra el mensaje de conflicto; tras guardar con éxito, sincroniza `expectedOrder = gameIds` y muestra el aviso de éxito (`MatchMapOrderEditor.tsx:47-62`).
- **Recarga Manual:** Botón `Recargar orden` que incrementa el contador `revision` (`setRevision((value) => value + 1)`), forzando un refresco limpio desde el servidor (`MatchMapOrderEditor.tsx:125-132`).
- **Formateo de Partidas:** Cada elemento muestra número de mapa (`index + 1`), identificador externo (`externalGameId ?? id`), ganador (`winner ?? 'Sin resultado'`) y duración en minutos y segundos (`${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`).

---

## 3. Estilos y Encapsulamiento Visual

Todos los componentes importan `components/crud-operations.css` (316 líneas), que organiza las clases mediante metodología BEM bajo el espacio de nombres de la aplicación:
- `.rcl-site .crud-operations-panel`: Contenedor principal con pestañas de recursos.
- `.rcl-site .crud-data-table`: Tabla con rejilla responsive y scroll horizontal en dispositivos móviles.
- `.rcl-site .crud-form`: Formulario en cuadrícula de dos columnas con validación visual de campos inválidos.
- `.rcl-site .crud-delete-dialog`: Diálogo modal con tema oscuro de alto contraste y advertencias en color rojo semántico.
- `.rcl-site .crud-map-order`: Contenedor con borde y lista interactiva para reordenar partidas de una serie.
