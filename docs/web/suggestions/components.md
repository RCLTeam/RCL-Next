# Componentes Visuales del Buzón de Sugerencias

[⬅️ Volver a Web Suggestions](README.md) | [Siguiente: Hooks ➡️](hooks.md)

---

## 1. Visión General

La capa visual de sugerencias reside en `apps/web/src/features/suggestions/components/` y se compone de dos elementos modulares desacoplados:
- **`SuggestionForm.tsx` (209 líneas):** Componente de presentación puro (*Dumb UI*) que renderiza el formulario, valida límites de longitud, emite eventos y proyecta banners de estado y errores.
- **`SuggestionModal.tsx` (123 líneas):** Contenedor accesible basado en el elemento nativo HTML5 `<dialog>` que orquesta los hooks de dominio y controla la interacción modal.

Ambos componentes cumplen estrictamente la directriz de **cero efectos colaterales de red en componentes presentacionales**: ninguna llamada a `fetch` o `WebSocket` se realiza dentro de ellos.

---

## 2. Componente de Formulario Puro: `SuggestionForm.tsx`

### 2.1 Contrato de Propiedades (`SuggestionFormProps`)
```typescript
export interface SuggestionFormProps {
  suggestion?: string;
  isAnonymous?: boolean;
  onSuggestionChange?: (value: string) => void;
  onAnonymousChange?: (value: boolean) => void;
  status?: SuggestionStatus | 'idle';
  isHealthy?: boolean;
  bridgeMessage?: string | undefined;
  bridgeDetails?: string | undefined;
  healthStatus?: BridgeHealthStatus;
  healthMessage?: BridgeHealthMessage | string | null | undefined;
  healthDetails?: string | null | undefined;
  nextRetryInSeconds?: number | null | undefined;
  countdown?: number | undefined;
  incidentId?: string | null | undefined;
  error?: string | null | undefined;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  onReset?: () => void;
  isSubmitting?: boolean;
  initialText?: string;
  initialAnonymous?: boolean;
}
```

### 2.2 Validación Visual y Comportamiento del Formulario
1. **Soporte Controlado / No Controlado:** Si no se proporcionan `suggestion` o `isAnonymous` como props, el componente gestiona estado local interno (`localText`, `localAnonymous`), garantizando flexibilidad en pruebas y prototipado (`SuggestionForm.tsx:49-55`).
2. **Contador de Caracteres Reactivo:** 
   - Muestra `${charCount} / 1000` con el atributo accesible `aria-live="polite"` (`L166-170`).
   - Aplica dinámicamente la clase CSS `is-overflow` si `charCount > 1000`.
3. **Aviso de Umbral Mínimo:**
   - Si `charCount > 0` y `trimmedLength < 10`, renderiza un texto informativo:
     ```html
     <small className="suggestion-hint">Mínimo 10 caracteres (faltan N)</small>
     ```
4. **Condición de Deshabilitación del Envío:**
   El botón de envío se bloquea (`disabled`) evaluando la regla (`L75`):
   ```typescript
   const isSubmitDisabled = !isHealthy || !isLengthValid || isInProgress;
   ```

### 2.3 Banners de Estado y Retroalimentación al Usuario

| Estado Visual | Elemento Renderizado | Contenido y Acciones |
|---|---|---|
| **Éxito Definitivo (`status === 'confirmed'`)** | `<output className="suggestion-banner suggestion-banner-success">` | Icono de verificación (`✓`), mensaje de confirmación de publicación en Discord y botón para enviar otra propuesta (`onReset`) (`L98-111`). |
| **Alerta de Salud (`!isHealthy`)** | `<div className="suggestion-alert suggestion-alert-warning" role="alert">` | Icono de advertencia (`⚠️`), título de diagnóstico del puente y detalles técnicos (`L115-125`). |
| **Fallo e Incidencia (`status === 'failed'`)** | `<div className="suggestion-banner suggestion-banner-error" role="alert">` | Mensaje de error, bloque con código formateado `[INCIDENT <uuid>]` y botón de copia al portapapeles con confirmación visual de 2 segundos (`¡Copiado!`) (`L127-148`). |
| **Tramitación en Progreso (`isInProgress`)** | `<output className="suggestion-status-indicator" aria-live="polite">` | Spinner visual de carga y etiqueta dinámica según el sub-estado (`L150-160`):<br>- `'queued'`: `"En cola..."`<br>- `'sending'`: `"Enviando..."`<br>- `'processing'`: `"Procesando en Discord..."`<br>- `'retrying'`: `"Reintentando en N segundos..."` |

---

## 3. Contenedor Modal Accesible: `SuggestionModal.tsx`

Implementado en `apps/web/src/features/suggestions/components/SuggestionModal.tsx`, este componente envuelve a `SuggestionForm` integrando el diálogo con los hooks de red y las normas de accesibilidad WAI-ARIA.

### 3.1 Uso del Elemento Nativo HTML5 `<dialog>`
El modal utiliza `<dialog ref={dialogRef}>` (`L79-87`), beneficiándose del control de capas nativo del navegador (*top layer*):
- **Apertura:** Ejecuta `dialog.showModal()` al montarse cuando `isOpen === true` (`L30-32`).
- **Cierre:** Invoca `dialog.close()` al desmontarse (`L35-37`).
- **Atributos Accesibles:** `aria-labelledby="suggestion-modal-title"` y `aria-modal="true"`.

### 3.2 Gestión de Foco y Cierres Interactivos
1. **Restauración de Foco:** Guarda una referencia al elemento que tenía el foco antes de abrir el modal (`previousFocus = document.activeElement`) y devuelve el foco a ese mismo elemento cuando el diálogo se cierra o desmonta (`L29, 38-40`).
2. **Cierre por Tecla Escape:** Captura el evento `onKeyDown` en el elemento diálogo; si la tecla pulsada es `Escape`, cancela el comportamiento por defecto del navegador y ejecuta el callback `onClose()` de forma controlada (`L52-57`).
3. **Cierre por Clic en Backdrop (Fondo):** En `handleBackdropClick` (`L46-50`), comprueba si `event.target === dialogRef.current`. Debido a la especificación HTML5, hacer clic en la zona oscurecida exterior al diálogo registra como target el propio elemento `<dialog>`, permitiendo detectar el clic fuera y cerrar el modal.
4. **Interceptación de Evento Cancel Nativo:** Intercepta `onCancel` (`L59-62`) con `preventDefault()` y delega en `onClose()`.

### 3.3 Integración de Hooks
`SuggestionModal` actúa como puente entre los hooks desacoplados y el formulario:
```typescript
const { data: healthData, isHealthy } = useBridgeHealth();
const {
  status,
  incidentId,
  error,
  countdown,
  isSubmitting,
  submitSuggestion,
  reset
} = useSuggestion();
```
Inyecta estas propiedades en `SuggestionForm`, logrando una separación completa entre presentación y lógica de negocio.
