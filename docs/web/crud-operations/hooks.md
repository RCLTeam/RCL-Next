# Hooks y Gestión de Estado: Web CRUD Operations

[⬅️ Volver a Componentes](components.md) | [Siguiente: Integración en Páginas ➡️](pages.md)

---

## 1. Organización del Estado Local y Ausencia de Hook Separado

Al contrastar la implementación física de `apps/web/src/features/crud-operations/` con el estándar arquitectónico modular canónico de la aplicación:

> **Organización del Estado Local:**
> La feature de operaciones CRUD **no** posee un subdirectorio físico `hooks/` ni exporta un hook dedicado (como `useCrudTable.ts` o `useCrudResource.ts`).
> En su lugar, la totalidad de la máquina de estados reactiva, el temporizador de *debounce*, la cancelación con `AbortController`, la paginación y la sincronización con la API residen **colocalizadas directamente dentro del componente de panel contenedor** `CrudDataPanel.tsx` (`líneas 14-80`), consumiendo las funciones de cliente de `../api/crud-operations-api.ts`.

---

## 2. Máquina de Estados Colocalizada (`CrudDataPanel.tsx`)

El componente `CrudDataPanel` gestiona las siguientes dimensiones de estado local:

```typescript
const { state } = useAuth();
const owner = state.status === 'authenticated' && state.user.role === 'owner';
const [search, setSearch] = useState('');
const [offset, setOffset] = useState(0);
const [revision, setRevision] = useState(0);
const [data, setData] = useState<CrudPageResult | null>(null);
const [error, setError] = useState('');
const [notice, setNotice] = useState('');
const [loading, setLoading] = useState(true);
const [busy, setBusy] = useState(false);
const [editor, setEditor] = useState<{ record: CrudRecord | null } | null>(null);
const [deleting, setDeleting] = useState<CrudRecord | null>(null);
```

### 2.1 Identificación de Privilegios de Gobernanza
- Consume el contexto global de identidad a través de `useAuth()` (`AuthProvider.tsx:83-88`).
- Deriva de forma booleana si el usuario posee rol `owner`, pasando esta propiedad hacia `CrudDeleteDialog` para habilitar las opciones destructivas en cascada.

---

## 3. Temporizador de Debounce (200 ms) y Cancelación con `AbortController`

- **Cita:** `CrudDataPanel.tsx:36-58`
- **Mecanismo:** La carga de registros responde a cambios en el nombre del recurso, la cadena de búsqueda, el desplazamiento de página o el contador de revisiones:

```typescript
useEffect(() => {
  const controller = new AbortController();
  setLoading(true);
  setData(null);
  setError('');

  const timer = window.setTimeout(() => {
    getCrudRecords(resource.name, search, offset, controller.signal)
      .then(setData)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : 'No se pudieron cargar los registros.'
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, 200);

  return () => {
    window.clearTimeout(timer);
    controller.abort();
  };
}, [resource.name, search, offset, revision]);
```

### Garantías de Fiabilidad del Efecto
1. **Debounce de 200 ms:** Agrupa las pulsaciones de teclado del usuario en la barra de búsqueda, impidiendo ráfagas de consultas a la API mientras se teclea.
2. **Cancelación Inmediata con `controller.abort()`:** Si el usuario modifica el texto antes de los 200 ms o cambia de pestaña, la petición en curso se cancela en la capa de red del navegador.
3. **Inmunidad a Excepciones de Aborto:** La comprobación `if (!controller.signal.aborted)` evita que los errores naturales de cancelación (`AbortError`) ensucien el estado visual de error del panel.

---

## 4. Orquestación de Mutaciones y Ciclo de Recarga (`mutate`)

- **Cita:** `CrudDataPanel.tsx:62-80`
- **Mecanismo:** Las operaciones asíncronas de guardado o borrado se unifican mediante la función interna `mutate`:
  - **Cerrojo Local `busy`:** Si `busy === true`, descarta cualquier nuevo clic del usuario.
  - **Protección de Desmontaje (`mounted.current`):** Una referencia mutable `mounted = useRef(true)` (`líneas 28-34`) evita invocar *setters* de React si el componente fue desmontado durante una petición en vuelo.
  - **Incremento de Revisión (`revision`):** Al finalizar con éxito, `setRevision((v) => v + 1)` dispara automáticamente el `useEffect` de carga para reflejar los datos actualizados.
  - **Ajuste Inteligente de Paginación:** Si se eliminó el único registro visible de una página (`deleting && data?.records.length === 1 && offset`), retrocede automáticamente a la página anterior:
    ```typescript
    if (deleting && data?.records.length === 1 && offset) setOffset(offset - 50);
    ```

---

## 5. Capa de Transporte Consumida (`api/crud-operations-api.ts`)

El panel delega todas las llamadas en el cliente tipado:
- `getCrudResources(signal)`: Obtiene el catálogo inicial de entidades.
- `getCrudRecords(resource, search, offset, signal)`: Consulta paginada con filtrado.
- `saveCrudRecord(resource, values, record)`: Emite `POST` para creaciones o `PUT` con `version` para actualizaciones optimistas.
- `previewCrudDelete(resource, record, signal)`: Emite `POST /delete-preview` para computar impactos y obtener el token SHA-256.
- `deleteCrudRecord(resource, record, confirmation)`: Emite `DELETE` transmitiendo el token de cascada.
