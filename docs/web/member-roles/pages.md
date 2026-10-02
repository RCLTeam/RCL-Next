# Vistas Ensambladoras (Smart Pages): Web Member Roles

[⬅️ Volver a Gestión de Estado y Transporte](hooks.md) | [Siguiente: Tipos y Contratos de Interfaz ➡️](types.md)

---

## 1. Montaje en la Página de Administración (`AdminPage.tsx`)

El panel de gobernanza de miembros no constituye una ruta aislada, sino que se ensambla como una sección integrada dentro de `apps/web/src/site/pages/admin/AdminPage.tsx:39-43, 57-58`:

```tsx
export function AdminPage({
  wsUrl,
  path = '/admin'
}: { wsUrl?: string | undefined; path?: string }) {
  return (
    <section id="admin" className="admin-content" aria-label="Administración">
      {/* Encabezado */}
      <RequireAdmin>
        <nav className="admin-navigation" aria-label="Funciones de administración">
          {/* Otras pestañas */}
          <SiteLink
            href="/admin/member-roles"
            aria-current={path === '/admin/member-roles' ? 'page' : undefined}
          >
            Roles Management
          </SiteLink>
          {/* ... */}
        </nav>
        {/* Enrutamiento condicional de paneles */}
        {path === '/admin/member-roles' ? (
          <MemberRolesPanel />
        ) : (
          /* Otros paneles y vista de resumen */
        )}
      </RequireAdmin>
    </section>
  );
}
```

---

## 2. Tarjeta de Acceso en la Vista Resumen (`admin-overview`)

En la vista general de administración (`path === '/admin'`), se renderiza una tarjeta de navegación directa hacia la gestión de miembros (`AdminPage.tsx:86-94`):

```tsx
<SiteLink href="/admin/member-roles">
  <span className="eyebrow">Miembros</span>
  <h2>Roles Management</h2>
  <p>
    Consulta los miembros y sus permisos de acceso. Los owners pueden gestionar sus
    roles.
  </p>
  <span>Ver miembros →</span>
</SiteLink>
```

---

## 3. Comportamiento Adaptativo según Rol del Operador

El acceso al panel se adapta según el nivel de privilegios del usuario:
1. **Para Administradores (`user.role === 'admin'`):**
   - Franquean la guardia `<RequireAdmin>`.
   - Pueden consultar la lista completa de miembros, buscar por nombre o Discord ID y paginar el censo.
   - El panel muestra el subtítulo informativo: `"Consulta los miembros y sus roles."` (`MemberRolesPanel.tsx:77`).
   - La columna de mutación de rol no se renderiza (`canManage === false`).
2. **Para Propietarios (`user.role === 'owner'`):**
   - Poseen facultades plenas de gestión (`canManage === true`).
   - El panel muestra el subtítulo operativo: `"Gestiona el acceso de los miembros: viewer, admin u owner."` (`MemberRolesPanel.tsx:76`).
   - Se activa la columna interactiva con desplegables `<Select>` y el flujo de confirmación modal para promover o degradar miembros.
