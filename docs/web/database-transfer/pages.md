# Integración en Páginas: Web Database Transfer

[⬅️ Volver a Hooks](hooks.md) | [Siguiente: Tipos y Contratos ➡️](types.md)

---

## 1. Centralización de Rutas en AdminPage y Ausencia de Carpeta `pages/`

Al auditar la organización de páginas en `apps/web/src/features/database-transfer/`:

> **Centralización en AdminPage:**
> La feature de transferencias de base de datos **no** posee un subdirectorio físico `pages/` interno.
> En su lugar, la integración y el montaje de la interfaz se realizan exclusivamente en la página maestra de administración del sitio:
> `apps/web/src/site/pages/admin/AdminPage.tsx` (`líneas 1-107`).

---

## 2. Ensamblaje en `AdminPage.tsx`

La vista `AdminPage` centraliza todas las herramientas de soporte y administración del monorepo, coordinando la navegación y asegurando que las funciones críticas queden bajo control de acceso estricto.

### 2.1 Protección Perimetral de Acceso (`<RequireAdmin>`)
- **Cita:** `AdminPage.tsx:21-103`
- **Mecanismo:** El panel de transferencia se monta exclusivamente en el interior del bloque `<RequireAdmin>` (`apps/web/src/features/auth/components/RequireAdmin.tsx`).
- Si un usuario no autenticado o con rol espectador (`viewer`) accede a la URL `/admin/database-transfer`, el componente no se monta en el árbol DOM y se presenta la pantalla de inicio de sesión.

### 2.2 Barra de Navegación y Pestañas
- **Cita:** `AdminPage.tsx:45-49`
- **Enlace de Pestaña:**
  ```tsx
  <SiteLink
    href="/admin/database-transfer"
    aria-current={path === '/admin/database-transfer' ? 'page' : undefined}
  >
    Database Transfer
  </SiteLink>
  ```
- Gestiona el atributo `aria-current="page"` cuando el usuario navega en esta sección.

### 2.3 Montaje Condicional del Panel
- **Cita:** `AdminPage.tsx:59-60`
- **Mecanismo:**
  ```tsx
  {path === '/admin/database-transfer' ? (
    <DatabaseTransferPanel />
  ) : ...}
  ```
  Al coincidir la ruta con `/admin/database-transfer`, se instancia `<DatabaseTransferPanel />`, iniciando la detección del rol del usuario (`admin` vs `owner`) para adaptar los controles visibles.

### 2.4 Ficha Informativa en la Vista de Resumen (`/admin`)
- **Cita:** `AdminPage.tsx:95-100`
- **Mecanismo:** En la vista principal de `/admin`, se expone la tarjeta descriptiva de transferencias:
  ```tsx
  <SiteLink href="/admin/database-transfer">
    <span className="eyebrow">Copias de seguridad</span>
    <h2>Database Transfer</h2>
    <p>Exporta un backup PostgreSQL. Los owners también pueden importar una copia.</p>
    <span>Importar o exportar →</span>
  </SiteLink>
  ```
