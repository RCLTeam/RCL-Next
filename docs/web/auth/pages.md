# Integración en Páginas y Rutas Protegidas: Web Auth

[⬅️ Volver a Hooks Headless y Estado](hooks.md) | [Siguiente: Tipos y Contratos de Interfaz ➡️](types.md)

---

## 1. Montaje Global del Proveedor (`App.tsx`)

Para garantizar que el contexto de autenticación esté disponible de manera homogénea en toda la aplicación, `AuthProvider` envuelve la raíz del árbol de componentes en `apps/web/src/App.tsx:44-54`:

```tsx
export function App() {
  // ...
  return (
    <AuthProvider>
      <SiteLayout
        currentPath={path}
        // ...
      >
        {renderPage()}
      </SiteLayout>
    </AuthProvider>
  );
}
```

Al ubicarse en la cúspide jerárquica:
- Las transiciones de navegación entre páginas no desmontan el proveedor ni reinician la comprobación de sesión.
- Cualquier componente en cualquier nivel de profundidad puede consumir `useAuth()` de forma reactiva.

---

## 2. Integración en la Cabecera de Navegación (`SiteLayout.tsx`)

La cabecera superior del portal (`apps/web/src/site/layout/SiteLayout.tsx:51-75`) monta el componente de control de sesión en el contenedor `.nav-account`:

```tsx
function SiteHeader({ leagueSwitch }: { leagueSwitch: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="nav-top">
        <SiteLink className="brand" href="/" aria-label="Rebel Crown Legacy · Inicio">
          <img src={brandAssets.rclLogo} alt="RCL" width="92" height="38" />
        </SiteLink>
        <div className="nav-account">
          <AuthControls />
        </div>
        {/* Botón de menú responsive */}
      </div>
      {/* ... */}
    </header>
  );
}
```

Además, el menú de navegación (`SiteNavigation`) utiliza `canAccessAdmin(auth.state)` para decidir si mostrar u ocultar de forma condicional el enlace directo hacia la sección de administración (`/admin`).

---

## 3. Barrera Perimetral en Vistas de Administración (`AdminPage.tsx`)

En `apps/web/src/site/pages/admin/AdminPage.tsx:21-103`, toda la estructura de pestañas de administración queda envuelta bajo el componente de protección perimetral `<RequireAdmin>`:

```tsx
export function AdminPage({ wsUrl, path = '/admin' }: { wsUrl?: string; path?: string }) {
  return (
    <section id="admin" className="admin-content" aria-label="Administración">
      <div className="admin-heading">
        <span className="eyebrow">Gestión de la competición</span>
        <h1>Admin</h1>
      </div>
      <RequireAdmin>
        <nav className="admin-navigation" aria-label="Funciones de administración">
          <SiteLink href="/admin/home-content">Home content</SiteLink>
          <SiteLink href="/admin/rofl/upload">ROFL Upload</SiteLink>
          <SiteLink href="/admin/crud">CRUD Operations</SiteLink>
          <SiteLink href="/admin/member-roles">Roles Management</SiteLink>
          <SiteLink href="/admin/database-transfer">Database Transfer</SiteLink>
        </nav>
        {/* Renderizado de paneles según path */}
      </RequireAdmin>
    </section>
  );
}
```

### Funciones Protegidas por `<RequireAdmin>`:
- `/admin/home-content`: Publicación de noticias, editoriales y quintetos de la semana.
- `/admin/rofl/upload`: Subida y parseo de ficheros binarios `.rofl`.
- `/admin/crud`: Inspección y modificación directa de entidades relacionales.
- `/admin/member-roles`: Auditoría y mutación de roles de acceso (`MemberRolesPanel`).
- `/admin/database-transfer`: Exportación e importación de volcados de base de datos.

---

## 4. Consumo en Otras Funcionalidades del Portal

El estado de autenticación también se consume en módulos específicos de usuario:
- **Predicciones (`PredictionsPage.tsx`):** Comprueba `state.status === 'authenticated'` para habilitar los formularios interactivos de pronósticos deportivos y asociar la votación al `discordId` del usuario.
- **Aislamiento de Paneles de Gestión:** Componentes como `CrudDataPanel` y `DatabaseTransferPanel` consultan `state.user.role` para adaptar los controles visibles a las atribuciones de su rol.
