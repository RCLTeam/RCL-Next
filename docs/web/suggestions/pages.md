# Integración en Vistas y Portal Principal

[⬅️ Volver a Web Suggestions](README.md) | [Siguiente: Tipos ➡️](types.md)

---

## 1. Visión General

A diferencia de módulos con rutas dedicadas en el cliente web (como la vista de subida de archivos ROFL en `/rofl-upload`), el buzón de sugerencias está concebido como una **capacidad transversal y omnipresente** accesible desde cualquier sección del portal RCL-Next.

Su integración se realiza en la plantilla global de maquetación del sitio (`SiteLayout.tsx`), permitiendo a los usuarios invocar el modal interactivo sin abandonar la vista activa de partidos, clasificaciones o estadísticas.

---

## 2. Integración en `SiteLayout.tsx`

La conexión arquitectónica se ubica en `apps/web/src/site/layout/SiteLayout.tsx:111,130,165`.

### 2.1 Botón Desencadenante en la Navegación
En la barra de navegación superior y en el menú de acceso rápido se ubica el botón interactivo:
```tsx
<button
  type="button"
  className="nav-link-suggestion"
  onClick={() => setSuggestionModalOpen(true)}
>
  Buzón de Sugerencias
</button>
```

### 2.2 Renderizado Condicional y Aislamiento del DOM
El modal no permanece oculto con clases CSS (`display: none`); se monta y desmonta de manera condicional mediante cortocircuito booleano (`SiteLayout.tsx:165`):

```tsx
{suggestionModalOpen && (
  <SuggestionModal onClose={() => setSuggestionModalOpen(false)} />
)}
```

### 2.3 Beneficios Arquitectónicos del Desmontaje Completo
1. **Cero Polución del DOM:** Cuando el modal está cerrado, no existe ningún nodo `<dialog>` ni elementos de formulario en el árbol del DOM, optimizando el rendimiento de renderizado del navegador.
2. **Ciclo de Vida Limpio:** Al desmontarse, se ejecutan de inmediato los efectos de limpieza de `SuggestionModal` y `useSuggestion`:
   - Se abortan peticiones de red activas en curso (`AbortController.abort()`).
   - Se destruyen temporizadores de sondeo (*polling*) e intervalos de cuenta regresiva.
   - El estado local se reinicia de manera natural en la siguiente apertura.
3. **Restauración Accesible del Foco:** Al desmontarse, el callback del hook nativo devuelve el foco del teclado al botón exacto que originó la apertura en el menú, cumpliendo con los criterios de éxito de accesibilidad WCAG 2.1 (Criterio 2.4.3: Orden del Foco).

---

## 3. Pruebas de Integración y Estrés en el Layout

El comportamiento del modal dentro de `SiteLayout` está certificado por la suite de pruebas `apps/web/src/features/suggestions/m4-modal-layout-stress.test.tsx` (31 tests aprobados):
- **Montaje/Desmontaje Repetitivo:** Verificación de que 50 ciclos continuos de apertura y cierre no acumulan escuchadores de eventos en el objeto global `window` ni degradan el rendimiento.
- **Interacción Multimodal:** Compatibilidad del diálogo frente a cambios de resolución de pantalla, redimensionamiento dinámico y coexistencia con menús desplegables de usuario.
