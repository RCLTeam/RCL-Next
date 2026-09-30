# Arquitectura del Frontend y Aplicación Web

[⬅️ Volver a Documentación de API](../api/README.md) | [Siguiente: Arquitectura de Base de Datos ➡️](../database/README.md)

---

## 1. Resumen Ejecutivo

La aplicación cliente de RCL-Next (`apps/web`) constituye el portal web interactivo para aficionados, jugadores y administradores de la liga. Está construida sobre **React 19**, el empaquetador de ultra alta velocidad **Vite**, **TailwindCSS** para diseño reactivo y **TypeScript** estricto en todo su árbol de componentes.

La arquitectura del frontend sigue con rigor el **Golden Standard Modular** del monorepo (`reference/rofl-upload-architecture.md`), fundamentado en el patrón de **Diseño Orientado a Características (*Feature-Driven Architecture*)** y **Ganchos Desacoplados (*Headless Hooks*)**. Cada funcionalidad en `apps/web/src/features/` aísla por completo la capa de presentación visual de los efectos secundarios de red, sincronización y estado.

---

## 2. Principios de Diseño del Frontend (Golden Standard)

1. **Componentes Puramente Presentacionales (*Dumb UI*):** Todos los componentes visuales ubicados en `components/` operan como funciones puras y deterministas. Tienen **estrictamente prohibido** invocar `fetch`, instanciar `WebSocket` o manejar efectos secundarios no visuales. Reciben el estado y emiten acciones exclusivamente a través de *props* y *callbacks*.
2. **Ganchos sin Interfaz (*Headless Hooks*):** La totalidad de la lógica de estado asíncrono, sincronización con APIs REST, streaming por WebSockets, sondeos con reintentos exponenciales y almacenamiento local reside en ganchos reactivos especializados en `hooks/` (como `useRoflUploadWs`, `useSuggestion` o `useBridgeHealth`).
3. **Páginas Ensambladoras Inteligentes (*Smart Pages*):** Las vistas en `pages/` (y las rutas en `apps/web/src/site/pages/`) no contienen lógica pesada de negocio; su única responsabilidad es actuar como puntos de ensamblaje entre los *headless hooks* y los componentes visuales puros.
4. **Contratos Tipados de Dominio (`types/`):** Cada funcionalidad declara sus interfaces de vista, uniones discriminadas de eventos, esquemas de formulario y estados de carga en su subcarpeta `types/`, alineados con `@rcl/contracts`.
5. **Umbral de Modularización:** Todo componente visual `.tsx` que supere las 150-200 líneas de código o contenga más de dos hooks de estado complejos se descompone en subcomponentes más pequeños o traslada su lógica a un gancho dedicado.

---

## 3. Catálogo de Características Web

La aplicación web se estructura en nueve características de dominio principales, cada una documentada en su propia subcarpeta atómica:

| Característica | Enlace | Resumen Funcional |
|---|---|---|
| **Subida de Repeticiones ROFL** | [rofl-upload/README.md](rofl-upload/README.md) | Panel interactivo de arrastrar y soltar repeticiones `.rofl` y paquetes `.zip`, gancho `useRoflUploadWs` para streaming de chunks binarios por WebSocket, barras de progreso y visor de anomalías. |
| **Buzón de Sugerencias** | [suggestions/README.md](suggestions/README.md) | Diálogo modal accesible, formulario con contador de caracteres, gancho `useSuggestion`, reducer de máquina de estados pura y pruebas de estrés de maquetación en múltiples viewports. |
| **Competición y Estadísticas** | [competition/README.md](competition/README.md) | Tablas de clasificaciones de liga, calendarios interactivos de jornadas, eliminatorias de playoffs, fichas de equipo, perfiles de jugadores y tablas de campeones con cálculo de MVP. |
| **Autenticación y Sesión** | [auth/README.md](auth/README.md) | Botones de inicio de sesión con Discord, controles de cabecera con avatar dinámico, proveedor de contexto de sesión y barreras perimetrales de renderizado para rutas protegidas. |
| **Gobernanza de Roles** | [member-roles/README.md](member-roles/README.md) | Panel de auditoría de miembros registrados en la plataforma, tabla con búsqueda reactiva, selectores de rol de sistema (`viewer`, `admin`, `owner`) y diálogos de confirmación. |
| **Operaciones CRUD de Liga** | [crud-operations/README.md](crud-operations/README.md) | Tablas dinámicas para gestión de entidades deportivas, formularios fuertemente tipados con soporte de claves foráneas y modales accesibles para confirmación de borrados relacionales en cascada. |
| **Transferencia y Copias de Seguridad** | [database-transfer/README.md](database-transfer/README.md) | Panel de administración de volcados PostgreSQL, descarga de copias `.dump`, área de subida con validación previa de archivos y barreras de confirmación tipada antes de restaurar. |
| **Contenido Editorial e Inicio** | [home-content/README.md](home-content/README.md) | Visor de artículos de noticias y comunicados oficiales, vista modal de lectura y tarjetas interactivas del quinteto ideal de la jornada (*Team of the Week*). |
| **Predicciones Comunitarias** | [predictions/README.md](predictions/README.md) | Tarjetas interactivas de votación para series Bo1/Bo3/Bo5, selector de marcadores exactos, termómetros de tendencia comunitaria tras el cierre de jornada y tabla de pronosticadores. |

---

## 4. Enlaces Cruzados con Otras Áreas

- **Servicios de Backend API:** Para consultar las especificaciones técnicas de las rutas HTTP y gateways WebSocket consumidos por estos componentes, ver [docs/api/README.md](../api/README.md).
- **Esquema de Base de Datos:** Para auditar los modelos de datos de PostgreSQL subyacentes, ver [docs/database/README.md](../database/README.md).
- **Suites de Pruebas Frontend:** Para conocer las pruebas unitarias y de renderizado de la interfaz, ver [docs/testing/suites/web.md](../testing/suites/web.md) y [docs/testing/suites/integration.md](../testing/suites/integration.md).
