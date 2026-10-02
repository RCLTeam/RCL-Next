# Módulo Web: Database Transfer Feature (Frontend Architecture)

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: Home Content API ➡️](../../../docs/api/home-content/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/web/src/features/database-transfer/` implementa la interfaz de usuario para las operaciones de copia de seguridad, descarga de volcados y restauración física de la base de datos de RCL-Next. Proporciona una experiencia de administración segura con controles de acceso por rol, inspección previa de archivos `.dump` y barreras de confirmación tipada para prevenir la pérdida accidental de datos.

La arquitectura del módulo se fundamenta en las siguientes directrices modulares:

1. **Aislamiento de Red en Componentes Visuales (*Dumb UI*):** Los componentes de presentación en `components/` (`DatabaseTransferPanel`) mantienen **estrictamente cero llamadas directas a `fetch` y cero instanciaciones de `WebSocket`**. Todo el tráfico hacia los endpoints de la API reside encapsulado en `api/database-transfer-api.ts`.
2. **Organización de Hooks y Estado:** La feature no posee un subdirectorio físico `hooks/`. La lógica reactiva de transferencia, el control de concurrencia local mediante `running.current`, la cancelación con `AbortController` y la gestión del archivo seleccionado se encuentran **colocalizados directamente en `DatabaseTransferPanel.tsx:12-48`**.
3. **Centralización en AdminPage:** La feature no dispone de una carpeta `pages/` interna. La integración de la vista se realiza en la página maestra de administración `apps/web/src/site/pages/admin/AdminPage.tsx`, bajo la ruta `/admin/database-transfer` y protegida por `<RequireAdmin>`.
4. **Flujo de Seguridad con Confirmación Tipada:** La restauración exige que el usuario propietario inspeccione la tabla comparativa de filas actuales vs. importadas y teclee explícitamente la palabra `"IMPORTAR"` en mayúsculas para habilitar el botón destructivo (`DatabaseTransferPanel.tsx:245-266`).
5. **Manejo Accesible de Sesión Revocada:** Al completarse la restauración física, el panel renderiza una vista accesible de aviso indicando que las sesiones previas han caducado de forma segura y ofreciendo un botón para reautenticarse mediante OAuth2 de Discord (`DatabaseTransferPanel.tsx:86-98`).

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Componentes de Presentación (Dumb UI)** | [components.md](components.md) | Catálogo de componentes visuales (`DatabaseTransferPanel`), especificación de props, renderizado por rol (`admin` vs `owner`) y certificación de cero red. |
| **Hooks y Gestión de Estado** | [hooks.md](hooks.md) | Máquina de estados colocalizada en `DatabaseTransferPanel.tsx`, cerrojo `running.current`, cancelación con `AbortController` y consumo de `api/`. |
| **Integración en Páginas** | [pages.md](pages.md) | Montaje de la feature en `AdminPage.tsx` bajo la pestaña `/admin/database-transfer`, barrera `<RequireAdmin>` y navegación modular. |
| **Tipos y Contratos de Interfaz** | [types.md](types.md) | Contratos de interfaz importados de `@rcl/contracts`, estados locales de carga y tipos de confirmación de transferencia. |

---

## 3. Garantías de Fiabilidad y Separación de Responsabilidades

- **Filtrado Defensivo de Archivos en Cliente:** Rechaza archivos sin extensión `.dump`, archivos vacíos (0 bytes) o que superen el límite operativo de 64 MiB antes de iniciar cualquier envío hacia el servidor.
- **Descarga Asíncrona sin Bloqueo de UI:** La exportación descarga el archivo binario mediante un `Blob` temporal en memoria y simula la pulsación de un elemento `<a>` con revocación automática de la URL de objeto (`URL.revokeObjectURL(url)`).
- **Inmunidad a Dobles Clics y Concurrencia:** Una referencia mutable `running = useRef(false)` descarta cualquier acción simultánea mientras se descarga o sube un archivo.
