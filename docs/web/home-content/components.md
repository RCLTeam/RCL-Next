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

### 2.4 `EditorialImagePicker.tsx` (`apps/web/src/features/home-content/components/EditorialImagePicker.tsx:5-78`)
Selector y cargador de imágenes para portadas e inserciones en artículos.

#### Props:
- `onSelect: (url: string) => void`: Callback invocado con la URL interna de la imagen una vez almacenada con éxito en el servidor.
- `onBusy?: (busy: boolean) => void`: Notifica al componente padre si una subida de archivo está en curso.

#### Validaciones del Lado del Cliente:
- Comprueba que el archivo seleccionado no supere los **5 MiB** (`file.size <= 5 * 1024 * 1024`), notificando al usuario antes de enviar tráfico a la red.
- Envía el binario crudo mediante `fetch('/api/v1/home-content/admin/images')` con su respectivo `Content-Type`.

---

### 2.5 `EditorialManager.tsx` (`apps/web/src/features/home-content/components/EditorialManager.tsx:13-336`)
Panel maestro-detalle para la administración de artículos.

#### Props (`EditorStateProps`):
- `dirty: boolean`: Estado sucio actual.
- `onDirty: (dirty: boolean) => void`: Notifica cuando el formulario tiene cambios sin guardar.
- `onBusy: (busy: boolean) => void`: Notifica cuando se está ejecutando una mutación asíncrona.

#### Características Destacadas:
- **Protección Frente a Pérdida de Datos:** Si el usuario selecciona otro artículo de la lista teniendo cambios pendientes, solicita confirmación explícita mediante `window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')` (`EditorialManager.tsx:31`).
- **Inserción de Imágenes en la Posición del Cursor:** Utiliza `bodyInput.current?.selectionStart` para insertar el código markdown de la imagen `![alt](url)` exactamente en el punto de edición activo del redactor (`EditorialManager.tsx:284`).
- **Conmutador de Vista Previa:** Permite alternar instantáneamente entre el editor de texto y la vista renderizada en vivo mediante `ArticleView`.

---

### 2.6 `HomeContentPanel.tsx` (`apps/web/src/features/home-content/components/HomeContentPanel.tsx:6-50`)
Contenedor principal montado en la página de administración (`AdminPage.tsx:52`).

- Ofrece dos pestañas: **Team of the Week** y **Editorial**.
- Bloquea la conmutación entre pestañas si hay una operación en curso (`busy`) o si existen cambios sin guardar (`dirty`), solicitando confirmación al usuario antes de descartar datos.

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
