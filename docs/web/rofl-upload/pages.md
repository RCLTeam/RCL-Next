# Enrutamiento y Montaje de Página

[⬅️ Volver a Web ROFL Upload](README.md) | [Siguiente: Tipos y Reducer ➡️](types.md)

---

## 1. Visión General

La interfaz de subida de repeticiones está integrada dentro de la suite de herramientas administrativas de RCL-Next. Su acceso está reservado exclusivamente a usuarios autenticados que posean privilegios de administrador (`admin`) o propietario (`owner`).

---

## 2. Integración en AdminPage y Ausencia de `RoflUploadPage.tsx`

En cumplimiento del estándar de documentación técnica del monorepo:

> [!WARNING]
> ### Inexistencia de un Archivo Físico `RoflUploadPage.tsx`
> En el código vivo del repositorio, no existe ningún archivo físico llamado `RoflUploadPage.tsx` en el directorio `features/rofl-upload/pages/` ni en ningún otro lugar del monorepo.
>
> 1. **Página Ensambladora Centralizada:** La vista no es una página independiente con su propio layout; es un panel secundario renderizado dentro de la página maestra administrativa `AdminPage.tsx` (`apps/web/src/site/pages/admin/AdminPage.tsx`).
> 2. **Montaje por Ruta Condicional:** `AdminPage.tsx` inspecciona la propiedad `path` del contexto de navegación y monta directamente el componente ensamblador de la feature:
>    ```tsx
>    // apps/web/src/site/pages/admin/AdminPage.tsx:53-55
>    ) : path === '/admin/rofl/upload' ? (
>      <RoflUploadPanel wsUrl={wsUrl} />
>    ) : ...
>    ```

---

## 3. Declaración de Rutas y Navegación

### 3.1 Registro en el Sitemap de la Aplicación
La ruta está registrada formalmente en el mapa de navegación del sitio en `apps/web/src/site/routes.tsx:150`:
```typescript
{
  path: '/admin/rofl/upload',
  title: 'ROFL Upload'
}
```

### 3.2 Protección de Acceso perimetral (`<RequireAdmin>`)
Toda la vista de administración está envuelta por el componente de guarda perimetral `<RequireAdmin>` (`AdminPage.tsx:21`):
- Si el usuario no ha iniciado sesión, es redirigido automáticamente a la pantalla de login con Discord.
- Si el usuario está autenticado pero no tiene rol de `admin` o `owner`, se le presenta un mensaje de acceso denegado con código 403, impidiendo que la interfaz monte `RoflUploadPanel` o intente abrir la conexión WebSocket `/ws/rofl-upload`.

### 3.3 Pestañas de Navegación del Panel Administrativo
En la barra de navegación superior de `AdminPage.tsx:30-50`, el administrador puede alternar fluidamente entre los diferentes módulos de gestión:
- `/admin/home-content`: Publicación de noticias y equipos de la semana.
- `/admin/rofl/upload`: Ingesta y procesamiento por lotes de repeticiones ROFL.
- `/admin/crud`: Operaciones CRUD sobre entidades deportivas del sistema.
- `/admin/member-roles`: Gestión de miembros de equipos y capitanías.
- `/admin/database-transfer`: Herramienta de volcado y sincronización de base de datos.
