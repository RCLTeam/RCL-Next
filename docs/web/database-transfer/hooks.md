# Hooks y Gestión de Estado: Web Database Transfer

[⬅️ Volver a Componentes](components.md) | [Siguiente: Integración en Páginas ➡️](pages.md)

---

## 1. Organización del Estado Local y Ausencia de Hook Separado

Al analizar la estructura de archivos de `apps/web/src/features/database-transfer/`:

> **Organización del Estado Local:**
> La feature de transferencias de base de datos **no** cuenta con un subdirectorio físico `hooks/` ni implementa un custom hook separado (como `useDatabaseTransfer.ts`).
> En su lugar, toda la gestión de estado reactivo, el control de concurrencia mediante referencias mutables, la cancelación de validaciones con `AbortController` y las descargas binarias están **colocalizadas directamente en el componente de panel** `DatabaseTransferPanel.tsx` (`líneas 12-65`), consumiendo las funciones de `../api/database-transfer-api.ts`.

---

## 2. Máquina de Estados y Referencias Mutables (`DatabaseTransferPanel.tsx`)

El componente gestiona el estado de transferencia y control de concurrencia mediante:

```typescript
const { state } = useAuth();
const owner = state.status === 'authenticated' && state.user.role === 'owner';
const [file, setFile] = useState<File | null>(null);
const [preview, setPreview] = useState<DatabaseImportPreview | null>(null);
const [busy, setBusy] = useState('');
const [error, setError] = useState('');
const [notice, setNotice] = useState('');
const [completed, setCompleted] = useState(false);
const running = useRef(false);
const mounted = useRef(true);
const validation = useRef<AbortController | null>(null);
```

### 2.1 Control de Concurrencia Local (`running.current`)
- **Cita:** `DatabaseTransferPanel.tsx:33-48`
- **Mecanismo:** Para evitar que múltiples clics del usuario disparen descargas o importaciones simultáneas, el método `run` utiliza un cerrojo síncrono mediante `running.current`:
  ```typescript
  async function run(label: string, action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      if (mounted.current)
        setError(error instanceof Error ? error.message : 'No se pudo completar la operación.');
    } finally {
      running.current = false;
      if (mounted.current) setBusy('');
    }
  }
  ```

---

## 3. Cancelación de Validaciones con `AbortController`

- **Cita:** `DatabaseTransferPanel.tsx:25-31`
- **Mecanismo:** La previsualización de archivos voluminosos puede requerir varios segundos para transferirse y simularse en el servidor.
  - Se almacena el controlador en `validation = useRef<AbortController | null>(null)`.
  - Al desmontar el componente o al seleccionar un archivo diferente, se ejecuta:
    ```typescript
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        validation.current?.abort();
      };
    }, []);
    ```
  - Esto cancela inmediatamente la carga del archivo en red si el usuario cambia de pestaña en el panel de administración.

---

## 4. Descarga Asíncrona de Volcados Binarios (`download`)

- **Cita:** `DatabaseTransferPanel.tsx:50-65`
- **Mecanismo:**
  1. Invoca `exportDatabase()` obteniendo un objeto binario `Blob`.
  2. Crea una URL de objeto en el navegador: `const url = URL.createObjectURL(blob)`.
  3. Crea dinámicamente un elemento `<a>`, asignando el nombre de archivo con marca temporal ISO:
     `link.download = "rcl-YYYY-MM-DDTHH-MM-SS.sssZ.dump"`.
  4. Inserta el enlace en el DOM (`document.body.append(link)`), simula el clic del usuario (`link.click()`) y remueve el elemento.
  5. Programa la liberación de memoria del búfer mediante `window.setTimeout(() => URL.revokeObjectURL(url), 1000)`.

---

## 5. Capa de Transporte Consumida (`api/database-transfer-api.ts`)

El panel consume tres funciones de red encapsuladas:
- `exportDatabase(): Promise<Blob>`: Solicita el archivo binario al endpoint `POST /export`.
- `previewDatabaseImport(file, signal): Promise<DatabaseImportPreview>`: Transmite el archivo `.dump` crudo a `POST /import-preview` para ejecutar la simulación `SAVEPOINT`.
- `importDatabase(file, confirmation): Promise<DatabaseImportResult>`: Transmite el archivo junto con la cabecera `X-Import-Confirmation` a `POST /import` para ejecutar la sustitución física.
