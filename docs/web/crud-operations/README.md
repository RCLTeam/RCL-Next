# Módulo Web: CRUD Operations Feature (Frontend Architecture)

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: Web Database Transfer ➡️](../../../docs/web/database-transfer/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/web/src/features/crud-operations/` implementa la interfaz de usuario para la administración visual de datos de la competición deportiva en RCL-Next. Proporciona paneles interactivos para la navegación tabular de registros, formularios de edición fuertemente tipados con soporte de claves foráneas y diálogos modales accesibles para la confirmación de borrados relacionales en cascada.

La arquitectura de este módulo sigue las directrices modulares del repositorio:

1. **Aislamiento de Red en Componentes Visuales (*Dumb UI*):** Todos los componentes ubicados en `components/` (`CrudOperationsPanel`, `CrudDataPanel`, `CrudRecordForm`, `CrudDeleteDialog`, `MatchMapOrderEditor`) respetan la invariante de **estrictamente cero llamadas directas a `fetch` y cero instanciaciones de `WebSocket`**. Todo el tráfico HTTP hacia la API reside encapsulado en `api/crud-operations-api.ts`.
2. **Organización de Hooks y Estado:** La feature no dispone de un subdirectorio físico `hooks/`. La máquina de estados local, el temporizador de *debounce* de búsqueda (200 ms), los controladores `AbortController` y la recarga tras mutaciones están centralizados directamente en `CrudDataPanel.tsx:36-58`, consumiendo las funciones de `api/crud-operations-api.ts`.
3. **Centralización en AdminPage:** La feature no dispone de una carpeta `pages/` propia. La integración visual se realiza de forma centralizada en la estación de administración `apps/web/src/site/pages/admin/AdminPage.tsx`, donde se monta `<CrudOperationsPanel />` bajo la ruta `/admin/crud` envuelto por la barrera perimetral `<RequireAdmin>`.
4. **Diálogo de Borrado Accesible y Seguro:** `CrudDeleteDialog.tsx` utiliza el elemento nativo `<dialog>` de HTML5 con bloqueo modal, presentando al usuario un desglose tabular de impacto antes de requerir la confirmación interactiva para administradores con rol `owner`.
5. **Estilos Scoped BEM:** Los estilos visuales se definen de forma encapsulada en `components/crud-operations.css` bajo el selector raíz de la aplicación `.rcl-site`.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Componentes de Presentación (Dumb UI)** | [components.md](components.md) | Catálogo de componentes visuales (`CrudOperationsPanel`, `CrudDataPanel`, `CrudRecordForm`, `CrudDeleteDialog`, `MatchMapOrderEditor`), especificación de props, callbacks y certificación de cero red. |
| **Hooks y Gestión de Estado** | [hooks.md](hooks.md) | Máquina de estados colocalizada en `CrudDataPanel.tsx`, temporizador de debounce (200 ms), cancelación con `AbortController` y consumo de `api/`. |
| **Integración en Páginas** | [pages.md](pages.md) | Montaje de la feature en `AdminPage.tsx` bajo la pestaña `/admin/crud`, protección perimetral `<RequireAdmin>` y navegación modular. |
| **Tipos y Contratos de Interfaz** | [types.md](types.md) | Contratos de interfaz importados de `@rcl/contracts`, estados locales de formulario y tipos de eventos de confirmación. |

---

## 3. Garantías de Fiabilidad y Separación de Responsabilidades

- **Cero Red en Componentes Visuales:** Los componentes delegan la comunicación externa exclusivamente en el cliente de transporte `api/crud-operations-api.ts`.
- **Cancelación Inmediata de Peticiones Pendientes:** Si el usuario teclea en el buscador o cambia de pestaña antes de completar la lectura, el controlador `AbortController` cancela la solicitud HTTP previa evitando condiciones de carrera en el renderizado de tablas.
- **Protección Antierrores de Red:** La clase `CrudDependenciesError` captura errores de integridad relacional del servidor (`RELATED_RECORDS`) y presenta una lista comprensible de entidades bloqueantes al usuario.
