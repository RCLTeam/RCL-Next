# Módulo Web: Member Roles Management (Frontend Golden Standard)

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: CRUD Operations API ➡️](../../../docs/api/crud-operations/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/web/src/features/member-roles/` implementa la interfaz de usuario y la orquestación del estado de cliente para la auditoría, búsqueda interactiva y asignación de roles de acceso al sistema (`appRole`: `'viewer'`, `'admin'`, `'owner'`) en RCL-Next.

Su diseño arquitectónico sigue rigurosamente el **Golden Standard Modular**:
1. **Componentes Presentacionales Puros (*Dumb UI*):** La tabla de visualización `MemberRolesTable` (`MemberRolesPanel.tsx:210-269`) posee **estrictamente cero llamadas a red** (`fetch`, `WebSocket` o APIs remotas). Es un componente determinista que recibe datos y *callbacks* exclusivamente vía *props*.
2. **Contenedor Inteligente de Estado (`MemberRolesPanel`):** Coordina la búsqueda insensible a mayúsculas con *debounce* de 200 ms, la cancelación de peticiones con `AbortController`, la paginación en bloques de 50 y la sincronización con el contexto de autenticación.
3. **Flujo de Confirmación Interactivo en Dos Fases:** La selección de un nuevo rol en la interfaz no desencadena una mutación inmediata; despliega un panel de confirmación (`member-roles-confirmation`, `MemberRolesPanel.tsx:127-154`) que advierte explícitamente sobre las consecuencias de otorgar privilegios de propietario (`owner`).
4. **Sincronización Inmediata en Auto-Degradación:** Si un propietario se auto-degrada, el panel detecta la coincidencia con el usuario autenticado actual e invoca `refreshSession()` (`MemberRolesPanel.tsx:60-61`), garantizando que la interfaz revoque de inmediato los controles de gestión sin requerir una recarga manual del navegador.
5. **Aislamiento de Transporte en `api/member-roles-api.ts`:** Centraliza las llamadas HTTP con traducción amigable de códigos de error (401, 403, 404, 409 `ROLE_CHANGED` y `LAST_OWNER`, 422).

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Componentes de Presentación (Dumb UI)** | [components.md](components.md) | Catálogo de componentes (`MemberRolesTable` puro y `MemberRolesPanel` contenedor), props, accesibilidad WAI-ARIA, confirmación modal y cero red en tabla. |
| **Gestión de Estado y Transporte** | [hooks.md](hooks.md) | Patrón de gestión de estado interno, debounce de 200ms con `AbortController`, paginación de 50 registros, cliente HTTP (`member-roles-api.ts`) y mapeo de errores en español. |
| **Vistas Ensambladoras (Smart Pages)** | [pages.md](pages.md) | Integración del panel en `/admin/member-roles` dentro de `AdminPage.tsx`, protección con `<RequireAdmin>` y navegación de administración. |
| **Tipos y Contratos de Interfaz** | [types.md](types.md) | Interfaces de estado local, comandos de mutación (`ChangeMemberRole`), modelos de miembros (`RoleMember`, `MemberRolesPage`) y tipado de eventos. |

---

## 3. Garantías de Separación de Responsabilidades

- **Aislamiento Total de Transporte:** `MemberRolesTable` no importa librerías HTTP ni efectúa mutaciones por sí misma; la selección en el desplegable `<Select>` simplemente invoca el callback `onChange(member, role)` proporcionado por el panel.
- **Trazabilidad de la Operación:** Cada mutación exitosa emite un aviso visual en pantalla (`notice`), limpia el diálogo de confirmación e incrementa la clave de `revision` para forzar la recarga de la lista de miembros desde la base de datos.
- **Prevención de Pérdida de Datos por Concurrencia:** Los errores 409 (`ROLE_CHANGED`) provenientes del backend se presentan al usuario como advertencia explícita para que recargue la lista antes de intentar una nueva modificación.
