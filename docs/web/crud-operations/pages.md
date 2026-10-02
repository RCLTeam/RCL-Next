# Integración en Páginas: Web CRUD Operations

[⬅️ Volver a Hooks](hooks.md) | [Siguiente: Tipos y Contratos ➡️](types.md)

---

## 1. Centralización de Rutas en AdminPage y Ausencia de Carpeta `pages/`

Al examinar la arquitectura de páginas de `apps/web/src/features/crud-operations/`:

> **Centralización en AdminPage:**
> La feature de operaciones CRUD **no** posee una subcarpeta física `pages/` interna ni define un componente de página exclusivo dentro de su directorio.
> En su lugar, la integración y montaje de la vista administrativa se realiza de forma centralizada en la estación modular de administración del sitio:
> `apps/web/src/site/pages/admin/AdminPage.tsx` (`líneas 1-107`).

---

## 2. Ensamblaje en `AdminPage.tsx`

La página `AdminPage` actúa como el contenedor orquestador de todas las capacidades administrativas del monorepo, inyectando la barra de navegación entre herramientas y protegiendo el acceso perimetral.

### 2.1 Barrera Perimetral de Acceso (`<RequireAdmin>`)
- **Cita:** `AdminPage.tsx:21-103`
- **Mecanismo:** La totalidad de las funciones administrativas residen envueltas por el componente `<RequireAdmin>` (`apps/web/src/features/auth/components/RequireAdmin.tsx`).
- Si el usuario no ha iniciado sesión o posee rol espectador (`viewer`), el contenido de `CrudOperationsPanel` no llega a montarse en el árbol de renderizado de React, presentándose en su lugar la pantalla de bloqueo o el botón de autenticación con Discord.

### 2.2 Barra de Navegación y Pestañas
- **Cita:** `AdminPage.tsx:35-37`
- **Enlace de Pestaña:**
  ```tsx
  <SiteLink href="/admin/crud" aria-current={path === '/admin/crud' ? 'page' : undefined}>
    CRUD Operations
  </SiteLink>
  ```
- Gestiona el atributo de accesibilidad `aria-current="page"` cuando el usuario se encuentra navegando activamente en `/admin/crud`.

### 2.3 Renderizado Condicional del Panel
- **Cita:** `AdminPage.tsx:55-56`
- **Mecanismo:**
  ```tsx
  {path === '/admin/crud' ? (
    <CrudOperationsPanel />
  ) : ...}
  ```
  Al coincidir la ruta con `/admin/crud`, se monta el componente contenedor `<CrudOperationsPanel />`, que inicializa la carga del catálogo de recursos.

### 2.4 Ficha Informativa en la Vista de Resumen (`/admin`)
- **Cita:** `AdminPage.tsx:78-85`
- **Mecanismo:** Cuando el usuario accede a la raíz de administración (`/admin`), se presenta una cuadrícula de tarjetas de resumen. La tarjeta dedicada a operaciones CRUD expone:
  ```tsx
  <SiteLink href="/admin/crud">
    <span className="eyebrow">Base de datos</span>
    <h2>CRUD Operations</h2>
    <p>
      Consulta, crea, edita y elimina los datos de la competición desde un único lugar.
    </p>
    <span>Gestionar datos →</span>
  </SiteLink>
  ```
