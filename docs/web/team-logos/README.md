# Módulo Frontend: Gestión de Logos de Equipos (Team Logos)

[⬅️ Volver a docs/web/](../README.md) | [Siguiente: Componentes UI ➡️](components.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/web/src/features/team-logos/` implementa la interfaz de usuario interactiva y la lógica de estado del lado del cliente para la administración y visualización de insignias oficiales de los equipos en la plataforma RCL-Next. Proporciona una consola integrada en el portal de administración (`/admin/team-logos`) para cargar nuevos emblemas gráficos, explorar el catálogo registrado, copiar las rutas de asignación y eliminar recursos obsoletos.

El diseño del módulo sigue con rigor el estándar de arquitectura modular desacoplada del frontend (Golden Standard):

1. **Componentes Puramente Presentacionales (*Dumb UI*):** Encapsulado en `TeamLogosPanel.tsx` (`apps/web/src/features/team-logos/TeamLogosPanel.tsx:5-125`), renderiza los controles de formulario, el selector de archivos nativo, la cuadrícula responsiva de tarjetas y el diálogo contextual de confirmación sin ejecutar peticiones HTTP directas ni gestionar lógica de transporte en su cuerpo de renderizado.
2. **Gancho Desacoplado (*Headless Hook*):** `useTeamLogos.ts` (`apps/web/src/features/team-logos/hooks/useTeamLogos.ts:4-98`) gobierna la totalidad del ciclo de vida reactivo (`logos`, `loading`, `busy`, `error`, `message`, `file`, `pendingDelete`, `inputKey`), ejecutando validaciones preventivas en el cliente (como el límite de 5 MB y el bloqueo de mutación sobre `placeholder.webp`), ordenación alfabética en memoria tras la subida y coordinación con el cliente API.
3. **Cliente API Tipado:** `team-logos-api.ts` (`apps/web/src/features/team-logos/api/team-logos-api.ts:25-34`) aísla el transporte HTTP hacia la superficie administrativa `/api/v1/team-logos/admin`, configurando `credentials: 'include'`, directivas `cache: 'no-store'` y mapeando los códigos de error HTTP a mensajes explicativos en lenguaje natural.
4. **Hojas de Estilo Confinadas:** `team-logos.css` (`apps/web/src/features/team-logos/team-logos.css:1-24`) define la maquetación responsiva bajo el espacio de nombres `.rcl-site`, implementando rejillas adaptativas con `minmax(min(260px, 100%), 1fr)` y estilos coherentes con el sistema visual corporativo.
5. **Resolutor de Rutas y Compatibilidad Histórica:** `team-logos.ts` (`apps/web/src/shared/resources/team-logos.ts:8-22`) normaliza rutas almacenadas previamente con prefijos públicos o de desarrollo (`/images/teams_logo/` y `/src/shared/assets/teams_logo/`) hacia la ruta de servicio administrada `/api/v1/team-logos/images/`.
6. **Insignia Resiliente con Fallback Multinivel:** `TeamBadge.tsx` (`apps/web/src/features/competition/components/TeamBadge.tsx:13-50`) implementa una máquina de degradación elegante ante errores de red (`onError`), alternando de forma transparente entre la imagen asignada al equipo, el logo de reserva `/api/v1/team-logos/images/placeholder.webp` y las iniciales textuales del club deportivo.
7. **Control de Acceso y Enrutamiento Central:** Integrado en el panel administrativo `AdminPage.tsx` (`apps/web/src/site/pages/admin/AdminPage.tsx:46-50, 58-59`) bajo el perímetro de autenticación `<RequireAdmin>`, y catalogado en la tabla de rutas de la aplicación `routes.tsx` (`apps/web/src/site/routes.tsx:145`).

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Componentes de Presentación e Interfaz** | [components.md](components.md) | Especificación exhaustiva de `TeamLogosPanel.tsx`, ciclo de vida y métodos de `useTeamLogos.ts`, estrategia de degradación multinivel en `TeamBadge.tsx`, integración en `AdminPage.tsx` y catálogo de estilos en `team-logos.css`. |
| **Tipos, Contratos y Modelo de Datos** | [types.md](types.md) | Contratos de interfaces TypeScript (`Logo`, `UseTeamLogosReturn`), cliente `teamLogosApi`, diccionario de errores HTTP (401, 403, 404, 409, 413, 422), constantes y firmas del resolutor de recursos. |

---

## 3. Principios de Interfaz y Experiencia de Usuario

1. **Cero Sobrescrituras Accidentales:** La interfaz y el hook impiden la mutación del archivo de reserva del sistema (`placeholder.webp`) mediante comprobaciones insensibles a mayúsculas antes de emitir la petición a la red.
2. **Validación Preventiva en Cliente:** Las cargas útiles que superan 5 MiB (5.242.880 bytes) son interceptadas en el navegador, mostrando una advertencia inmediata y ahorrando transferencias de red destinadas a ser rechazadas por el servidor.
3. **Reseteo Atómico de Formularios mediante `inputKey`:** Para sortear las limitaciones de manipulación del valor nativo de `<input type="file">`, el gancho incrementa un contador reactivo tras cada subida exitosa, forzando la reconstrucción limpia del nodo en el DOM sin recargas de página.
4. **Ergonomía de Asignación en Portapapeles:** Cada tarjeta de logo incluye un campo de texto de solo lectura con su URL absoluta que selecciona automáticamente todo su contenido al recibir el foco (`event.target.select()`), facilitando la copia manual además del botón dedicado con la API del portapapeles.
5. **Navegación Accesible y Foco Teclado:** Todos los controles interactivos disponen de anillos de enfoque de alto contraste (`:focus-visible` con contorno de 2px en tono lima corporativo), anuncios WAI-ARIA inmediatos con `role="alert"` y regiones vivas mediante `<output>`.
6. **Inmunidad contra Enlaces Rotos:** En toda la plataforma pública, el componente `TeamBadge` asegura que ningún escudo de equipo se renderice como una imagen rota si un archivo es eliminado o se encuentra temporalmente inalcanzable.
