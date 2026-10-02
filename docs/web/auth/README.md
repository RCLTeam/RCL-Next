# Módulo Web: Client-Side Authentication (Frontend Golden Standard)

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: Web Member Roles ➡️](../../../docs/web/member-roles/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/web/src/features/auth/` implementa la arquitectura de cliente para la gestión del estado de sesión, autenticación federada con Discord y control de acceso visual en RCL-Next. Proporciona componentes de interfaz de usuario altamente desacoplados, contextos de difusión reactiva de identidad y barreras perimetrales de renderizado para rutas de administración.

El diseño sigue estrictamente el **Golden Standard Modular** del repositorio:
1. **Componentes Puramente Presentacionales (*Dumb UI*):** Componentes como `AuthControlsView` (`AuthControls.tsx:15-92`) operan estrictamente como funciones puras de interfaz sin ningún efecto secundario. Contienen **estrictamente cero llamadas a red** (`fetch`, `WebSocket` o APIs de red). Reciben el estado y *callbacks* exclusivamente vía *props*.
2. **Centralización y Ciclo de Vida en `AuthProvider`:** Todo el estado de sesión, sincronización con `/api/v1/auth/me` y mecanismos de cierre de sesión residen en `AuthProvider.tsx:33-81`.
3. **Cancelación Automática con `AbortController`:** Las consultas de sesión pendientes se cancelan inmediatamente mediante `controller.abort()` si el componente se desmonta o si el usuario solicita un reintento manual (`AuthProvider.tsx:41, 51`).
4. **Protección Perimetral Declarativa (`RequireAdmin`):** Barrera visual (`RequireAdmin.tsx:5-34`) que intercepta el renderizado de vistas sensibles, presentando estados accesibles de comprobación, solicitud de login o denegación de acceso sin duplicar lógica en cada página.
5. **Aislamiento de Transporte en `api/auth-api.ts`:** Todas las llamadas HTTP de navegador (`getSession`, `endSession`) están encapsuladas con validación defensiva en tiempo de ejecución de las respuestas del servidor.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Componentes de Presentación (Dumb UI)** | [components.md](components.md) | Catálogo de componentes visuales (`AuthControlsView`, `AuthControls`, `RequireAdmin`), especificación de props, accesibilidad WAI-ARIA y confirmación de cero red. |
| **Hooks Headless y Contexto de Sesión** | [hooks.md](hooks.md) | Proveedor `AuthProvider`, consumo reactivo con `useAuth()`, función auxiliar `canAccessAdmin()`, cancelación `AbortController` y prevención de dobles clics en logout. |
| **Integración en Páginas y Rutas Protegidas** | [pages.md](pages.md) | Montaje de `AuthProvider` en `App.tsx`, integración en cabecera `SiteLayout.tsx` y protección de rutas administrativas en `AdminPage.tsx`. |
| **Tipos y Contratos de Interfaz** | [types.md](types.md) | Uniones discriminadas de estado (`AuthState`), interfaz del contexto (`AuthSession`) y reexportación de contratos de usuario. |

---

## 3. Garantías de Separación de Responsabilidades

- **Cero Red en Componentes Visuales:** `AuthControlsView` no importa `fetch`, `auth-api.ts` ni librerías de red; solo renderiza markup HTML según el estado recibido.
- **Mapeo Seguro de Avatares:** Renderizado condicional de avatares animados (`.gif` si el hash comienza por `a_`, o `.png` en caso contrario), con fallback accesible a las iniciales del usuario (`AuthControls.tsx:38-51`).
- **Resiliencia ante Fallos de Red:** Si `/api/v1/auth/me` devuelve error o la red falla, la UI transiciona al estado discriminado `'error'` permitiendo al usuario reintentar sin recargar la página completa.
