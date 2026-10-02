# Componentes de Presentación (Dumb UI): Editorial Home Content

[⬅️ Volver a Web Home Content](README.md) | [Siguiente: Hooks ➡️](hooks.md)

---

## 1. Visión General y Aislamiento de Red

Los componentes visuales del módulo residen en `apps/web/src/features/home-content/components/` y en `apps/web/src/site/pages/home/components/`. Siguiendo el **Golden Standard Modular** del monorepo, estos componentes operan como **Dumb Components** puros:
- **Cero Red:** No contienen llamadas a `fetch`, `WebSocket`, `XMLHttpRequest` ni librerías de transporte.
- **Flujo Unidireccional:** Reciben datos mediante *props* y emiten intenciones de usuario a través de *callbacks* (`onSaved`, `onDeleted`, `onDirty`, `onBusy`).
- **Seguridad Incondicional:** No utilizan `dangerouslySetInnerHTML` en ningún componente.

---

## 2. Catálogo de Componentes Visuales

### 2.1 `ArticleView.tsx` (`apps/web/src/features/home-content/components/ArticleView.tsx:5-64`)
Componente presentacional de lectura de artículos editoriales.

#### Props:
```typescript
interface ArticleViewProps {
  article: EditorialInput;
  publishedAt?: string | null | undefined;
}
```

#### Mecanismos y Seguridad:
1. **Cálculo de Tiempo de Lectura (`ArticleView.tsx:9`):**
   ```typescript
   const minutes = Math.max(1, Math.ceil(article.body.split(/\s+/).length / 220));
   ```
   Calcula la duración estimada a razón de 220 palabras por minuto, garantizando un mínimo de 1 minuto.
2. **Renderizado Seguro de Texto (Sin `dangerouslySetInnerHTML`, líneas 38-56):**
   Divide el cuerpo del artículo por saltos de línea dobles (`body.split(/\n\s*\n/)`) y analiza cada bloque mediante expresiones regulares y prefijos textuales:
   - **Imágenes Inline:** Evalúa la expresión regular estricta:
     ```typescript
     /^!\[([^\]\n]+)\]\((\/api\/v1\/home-content\/images\/[a-f0-9-]{36}\.(?:png|jpg|webp))\)$/
     ```
     Si coincide, renderiza `<figure className="editorial-inline-image"><img src={...} alt={...} /><figcaption>{...}</figcaption></figure>`. Si la imagen apunta a un dominio no autorizado o utiliza protocolos sospechosos, se renderiza como un simple párrafo de texto `<p>`, previniendo ataques de inyección de recursos externos.
   - **Subtítulos:** Si el párrafo comienza por `'## '`, genera un encabezado `<h2>{paragraph.slice(3)}</h2>`.
   - **Citas:** Si el párrafo comienza por `'> '`, genera un bloque de cita `<blockquote>{paragraph.slice(2)}</blockquote>`.
   - **Párrafos Estándar:** Cualquier otro bloque se renderiza como nodo de texto plano dentro de un elemento `<p>`.

---

### 2.2 `ContentField.tsx` (`apps/web/src/features/home-content/components/ContentField.tsx:3-50`)
Control de formulario accesible reutilizable para entradas de texto de una o múltiples líneas.

#### Props:
- `label`: Etiqueta visible y accesible (`<label>`).
- `value`: Valor controlado (`string`).
- `onChange`: Callback con el nuevo valor (`(value: string) => void`).
- `error`: Mensaje de error de validación opcional.
- `multiline`: Booleano que conmuta entre `<input type="text">` y `<textarea>`.
- `rows`: Número de filas visibles en modo multilínea (por defecto 3).
- `maxLength`: Límite máximo de caracteres con contador visual accesible (`aria-describedby`).
- `placeholder`, `required`, `autoFocus`, `inputRef`: Atributos estándar de formulario.

---

### 2.3 `ContentStatus.tsx` (`apps/web/src/features/home-content/components/ContentStatus.tsx:3-18`)
Indicador visual del estado asíncrono para operaciones de carga y visualización de errores.

#### Props:
- `loading?: boolean`: Muestra un spinner o mensaje accesible de carga.
- `error?: string`: Mensaje de error legible para el usuario.
- `retry?: () => void`: Botón de acción para reintentar la operación fallida.

---

### 2.4 `EditorialImagePicker.tsx` (`apps/web/src/features/home-content/components/EditorialImagePicker.tsx:4-83`)
Selector y cargador de imágenes para portadas e inserciones en artículos.

#### Props:
- `label`: Etiqueta descriptiva del control.
- `description?: string`: Valor controlado para la descripción accesible / texto alternativo.
- `onDescriptionChange?: (value: string) => void`: Callback para actualizar la descripción controlada.
- `descriptionRequired?: boolean`: Exige texto alternativo antes de seleccionar archivo (por defecto `false`).
- `onUploaded: (url: string, description: string) => void`: Callback invocado con la URL interna de la imagen una vez almacenada con éxito en el servidor.
- `onBusy?: (busy: boolean) => void`: Notifica al componente padre si una subida de archivo está en curso.

#### Validaciones del Lado del Cliente:
- Comprueba que se haya escrito una descripción antes de subir el archivo (`EditorialImagePicker.tsx:46-49`).
- Valida que el archivo seleccionado pertenezca a los tipos MIME permitidos (`'image/png'`, `'image/jpeg'`, `'image/webp'`) y no supere los **5 MiB** (`file.size <= 5 * 1024 * 1024`) antes de enviar tráfico a la red (`EditorialImagePicker.tsx:50-56`).
- Notifica el ciclo asíncrono activando `onBusy(true)` durante la carga y desactivándolo en el bloque `finally` (`EditorialImagePicker.tsx:58, 71`).

#### Aviso de Ciclo de Vida y Caducidad (TTL de 7 días):
El componente incorpora una indicación explícita para el redactor (`EditorialImagePicker.tsx:76-79`):
```tsx
<small>
  Guarda el artículo para conservar las imágenes. Las subidas sin guardar caducan a los 7
  días.
</small>
```
Este aviso documenta el contrato de persistencia: las imágenes subidas residen como candidatas temporales en el servidor. Si el redactor abandona la edición sin guardar, la limpieza del cliente solicita su eliminación inmediata; si la solicitud del cliente no llega (por corte de red o cierre forzado), el recolector periódico del servidor las purga tras agotar el período de gracia de 7 días.

---

### 2.5 `EditorialManager.tsx` (`apps/web/src/features/home-content/components/EditorialManager.tsx:27-353`)
Panel maestro-detalle para la administración de artículos editoriales.

#### Props (`EditorStateProps`):
- `dirty: boolean`: Estado sucio actual.
- `onDirty: (dirty: boolean) => void`: Notifica cuando el formulario tiene cambios sin guardar.
- `onBusy: (busy: boolean) => void`: Notifica cuando se está ejecutando una mutación asíncrona.

#### Características y Mecanismos de Ingeniería:
1. **Clave de Revisión Compuesta para Reinicio de Estado (`editorRevision`):**
   ```tsx
   // EditorialManager.tsx:81-82
   <ArticleForm
     key={`${selected === 'new' ? 'new' : selected.id}:${editorRevision}`}
     initial={selected === 'new' ? null : selected}
     {...props}
     // ...
   />
   ```
   En la función `select` (`EditorialManager.tsx:32-37`):
   ```typescript
   function select(article: EditorialArticle | 'new' | null) {
     if (props.dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
     props.onDirty(false);
     setEditorRevision((value) => value + 1);
     setSelected(article);
   }
   ```
   Si el redactor selecciona otro artículo teniendo cambios pendientes, se solicita confirmación con `window.confirm`. Al confirmar, se limpia la bandera `dirty` y se incrementa `editorRevision`. La clave compuesta en `ArticleForm` fuerza a React a desmontar la instancia anterior y montar una completamente nueva, asegurando el reinicio total de los estados locales del formulario, errores y previsualización.
2. **Integración con `PendingImages` y Descarte al Abandonar:**
   En `ArticleForm` (`EditorialManager.tsx:142-153`):
   ```typescript
   const [uploadedImages] = useState(() => new PendingImages(discardImages));
   useEffect(() => {
     uploadedImages.resume();
     const pageHide = (event: PageTransitionEvent) => {
       if (!event.persisted) uploadedImages.dispose();
     };
     window.addEventListener('pagehide', pageHide);
     return () => {
       window.removeEventListener('pagehide', pageHide);
       uploadedImages.dispose();
     };
   }, [uploadedImages]);
   ```
   El formulario instancia `PendingImages` inyectando `discardImages` (`home-content-api.ts:42-46`). Al desmontarse el formulario o ante el evento `pagehide` sin persistencia en caché (`!event.persisted`), invoca `uploadedImages.dispose()`, desencadenando la eliminación en segundo plano de cualquier imagen subida que no haya sido guardada.
3. **Persistencia Atómica y Rescate de Imágenes:**
   Al enviar el formulario (`EditorialManager.tsx:203-205`):
   ```typescript
   const article = await uploadedImages.save((urls) =>
     saveArticle(initial?.id ?? null, form, urls)
   );
   ```
   `uploadedImages.save` pasa la lista de URLs de imágenes subidas a `saveArticle`, permitiendo al servidor vincularlas al artículo y marcar como candidatas de recolección aquellas que hayan sido retiradas del cuerpo.
4. **Confirmación en Eliminación Definitiva:**
   En `remove()` (`EditorialManager.tsx:164-177`), antes de ejecutar `deleteArticle(initial.id)`, solicita confirmación explícita mediante `window.confirm(¿Eliminar definitivamente «${initial.title}»?)`.
5. **Inserción de Imágenes en la Posición del Cursor:**
   Utiliza `bodyInput.current?.selectionStart` para insertar el código markdown de la imagen `![alt](url)` exactamente en el punto de edición activo del redactor (`EditorialManager.tsx:284-297`).
6. **Conmutador de Vista Previa:**
   Permite alternar instantáneamente entre el editor de texto y la vista renderizada en vivo mediante `ArticleView` (`EditorialManager.tsx:182-194`).

---

### 2.6 `HomeContentPanel.tsx` (`apps/web/src/features/home-content/components/HomeContentPanel.tsx:7-52`)
Contenedor principal montado en la página de administración (`AdminPage.tsx:52`).

#### Características de Coordinación:
1. **Guardia a Nivel de Panel con `useEditorLeaveGuard`:**
   ```typescript
   // HomeContentPanel.tsx:11
   useEditorLeaveGuard(dirty, busy);
   ```
   Instala la guardia de abandono en el contexto de navegación global, interceptando intentos de salir de la ruta o cerrar la ventana mientras cualquiera de los editores hijos tenga cambios sin guardar o mutaciones activas.
2. **Protección en Conmutación de Pestañas (`changeTab`):**
   ```typescript
   // HomeContentPanel.tsx:12-17
   function changeTab(value: typeof tab) {
     if (value === tab || busy) return;
     if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
     setDirty(false);
     setTab(value);
   }
   ```
   - Si `busy` está activo, bloquea el cambio de pestaña.
   - Si existen cambios sin guardar (`dirty === true`), solicita confirmación explícita al usuario. Si el usuario cancela, la pestaña actual se mantiene intacta. Si confirma, se limpia `dirty` y se conmutan las pestañas entre **Team of the Week** y **Editorial**.
3. **Propagación del Estado de Edición (`EditorStateProps`):**
   Pasa `dirty`, `onDirty={setDirty}` y `onBusy={setBusy}` (`HomeContentPanel.tsx:46, 48`) a los submódulos `WeeklyTeamManager` y `EditorialManager`.

---

### 2.7 `WeeklyRoundEditor.tsx` (`apps/web/src/features/home-content/components/WeeklyRoundEditor.tsx:10-194`)
Formulario de asignación de los 5 puestos del quinteto ideal para una jornada deportiva.

#### Características Deportivas:
- Muestra 5 desplegables correspondientes a **Top, Jungla, Mid, ADC y Support**.
- **Filtrado por Rol:** Cada desplegable lista únicamente los jugadores candidatos que efectivamente disputaron partidas en esa posición durante la jornada (`candidates.filter(item => item.roles.includes(player.role))`, línea 158).
- **Prevención de Duplicados en Interfaz:** Deshabilita de forma automática a los jugadores que ya hayan sido seleccionados en otra posición del mismo quinteto (`chosen.has(item.memberId)`, línea 159).

---

### 2.8 `WeeklyTeamManager.tsx` (`apps/web/src/features/home-content/components/WeeklyTeamManager.tsx:11-146`)
Controlador de nivel superior para el quinteto ideal. Coordina la selección jerárquica de temporada, división y jornada, descargando los candidatos mediante `useHomeContent` y delegando la edición a `WeeklyRoundEditor`.

---

## 3. Componentes de la Página de Inicio (`apps/web/src/site/pages/home/components/`)

### 3.1 `EditorialGrid.tsx` (`EditorialGrid.tsx:7-61`)
Sección editorial integrada en la página de inicio (`HomePage.tsx:58`).
- Descarga los artículos publicados mediante `useHomeContent<EditorialArticle[]>('articles')`.
- Divide la lista en un artículo destacado principal (`featured`) y los artículos secundarios restantes (`articles`, línea 9).
- El artículo destacado se renderiza a la izquierda en un banner de gran formato (`.news-hero`).
- Los artículos secundarios se apilan en la columna lateral (`.news-side`), precedidos por su número ordinal formateado a dos dígitos (`String(index + 1).padStart(2, '0')`, línea 48).
- Cada tarjeta enlaza a `/editorial/:id`, abriendo el modal de lectura.

### 3.2 `TeamOfTheWeekStrip.tsx` (`TeamOfTheWeekStrip.tsx:12-79`)
Tira horizontal en la página de inicio que exhibe el quinteto ideal de la división activa.
- Incluye un selector accesible de jornada para consultar quintetos históricos.
- Renderiza 5 tarjetas (`.totw-card`) para los roles competitivos. Si una posición no ha sido cubierta, muestra una silueta de torre de ajedrez (`♜`, línea 66).
- Integra como fondo de tarjeta el carrusel de splash arts de campeones `WeeklyChampionBackground`.

### 3.3 `WeeklyChampionBackground.tsx` (`WeeklyChampionBackground.tsx:5-56`)
Carrusel rotativo de fondos de campeones utilizados por el jugador en esa jornada.
- **Rotación Automática:** Conmuta de campeón cada 4.500 ms mediante `setInterval` (`WeeklyChampionBackground.tsx:30`).
- **Respeto a Accesibilidad de Movimiento:** Escucha la consulta de medios `window.matchMedia('(prefers-reduced-motion: reduce)')`. Si el usuario tiene habilitada la reducción de movimiento en su sistema operativo, el temporizador se detiene por completo (`lines 25-37`), manteniendo estática la primera imagen.
- **Ocultamiento de Imágenes Rotas:** Incorpora manejador `onError={(event) => { event.currentTarget.hidden = true; }}` para no mostrar marcos rotos si falla la carga de un recurso gráfico externo.
