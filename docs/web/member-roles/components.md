# Componentes de Presentación (Dumb UI): Web Member Roles

[⬅️ Volver a la Documentación del Módulo](README.md) | [Siguiente: Gestión de Estado y Transporte ➡️](hooks.md)

---

## 1. Componente Presentacional Puro (`MemberRolesTable`)

El componente `MemberRolesTable` (`apps/web/src/features/member-roles/components/MemberRolesPanel.tsx:210-269`) es un componente puramente tonto (*Dumb Component*).

### 1.1 Garantía Estricta de Cero Red
- **0 peticiones `fetch`**, **0 llamadas `WebSocket`** y **0 accesos a APIs de red**.
- Componente funcional determinista libre de estado interno o llamadas asíncronas.
- Toda la interactividad se comunica a través del callback `onChange`.

---

### 1.2 Interfaz de Props

Definida en `MemberRolesPanel.tsx:211-219`:
```typescript
interface MemberRolesTableProps {
  members: RoleMember[];
  canManage: boolean;
  disabled: boolean;
  onChange: (member: RoleMember, role: MemberRole) => void;
}
```

- `members` (*RoleMember[]*): Lista de usuarios de la página actual a representar en la tabla.
- `canManage` (*boolean*): Indica si el usuario actual posee permisos de gestión (`owner`). Si es `false`, la columna de cambio de rol no se renderiza.
- `disabled` (*boolean*): Deshabilita los elementos interactivos mientras se ejecuta una mutación o existe una confirmación pendiente.
- `onChange` (*(member: RoleMember, role: MemberRole) => void*): Callback invocado cuando el usuario selecciona un rol en el desplegable.

---

### 1.3 Semántica y Accesibilidad WAI-ARIA

El marcado HTML de la tabla garantiza accesibilidad completa:
- `<caption className="sr-only">`: Proporciona un título descriptivo para lectores de pantalla (`"Miembros y roles de acceso"`).
- `<th scope="col">`: Define el alcance de los encabezados de columna: *Miembro*, *ID de Discord*, *Rol* y opcionalmente *Cambiar rol*.
- `<span className="member-role-badge">`: Insignia visual accesible con el rol actual del miembro.
- `<Select variant="form">`: Desplegable accesible con `aria-label={`Rol de ${member.username}`}` para permitir interacción directa mediante lectores de pantalla y navegación por teclado.

---

## 2. Contenedor de Estado del Panel (`MemberRolesPanel`)

El componente `MemberRolesPanel` (`apps/web/src/features/member-roles/components/MemberRolesPanel.tsx:9-208`) actúa como orquestador del estado de la sección de roles:

### 2.1 Elementos de la Barra de Herramientas (`member-roles-toolbar`)
- **Campo de Búsqueda:** Input semántico de tipo `search` con límite de 120 caracteres (`maxLength={120}`). Al modificar el texto, reinicia el `offset` a 0 y cancela cualquier diálogo de confirmación abierto.
- **Botón Actualizar:** Dispara un refresco explícito incrementando el contador de `revision`.

### 2.2 Panel de Confirmación en Dos Fases (`member-roles-confirmation`)

Ubicado en `MemberRolesPanel.tsx:127-154`:
Al interactuar con el `<Select>` de la tabla, la acción no se guarda inmediatamente en el servidor. En su lugar, se abre una sección modal de confirmación con `aria-label="Confirmar cambio de rol"`:

```tsx
{change && canManage && (
  <section className="member-roles-confirmation" aria-label="Confirmar cambio de rol">
    <h3>Cambiar el rol de {change.member.username}</h3>
    <p>
      {change.member.discordId} · {change.member.role} → {change.role}
    </p>
    {change.role === 'owner' && (
      <p>Un owner puede asignar y retirar roles a otros miembros.</p>
    )}
    <div className="member-roles-actions">
      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        onClick={() => void saveRole()}
      >
        {busy ? 'Guardando…' : 'Confirmar cambio'}
      </button>
      <button
        type="button"
        className="btn-ghost"
        disabled={busy}
        onClick={() => setChange(null)}
      >
        Cancelar
      </button>
    </div>
  </section>
)}
```

- **Advertencia de Privilegios:** Si el nuevo rol seleccionado es `'owner'`, muestra una advertencia explícita: `"Un owner puede asignar y retirar roles a otros miembros."`.
- **Botón Cancelar:** Permite al operador abortar el cambio sin alterar el estado.

---

### 2.3 Controles de Paginación (`member-roles-pagination`)

Ubicados en `MemberRolesPanel.tsx:178-202`:
- **Botón Anterior:** Deshabilitado si `offset === 0` o si la interfaz está ocupada (`busy`). Reduce el offset en 50 unidades.
- **Indicador de Página:** Muestra `Página {offset / 50 + 1}`.
- **Botón Siguiente:** Deshabilitado si `page.hasMore === false` o si `busy === true`. Incrementa el offset en 50 unidades.
