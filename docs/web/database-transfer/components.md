# Componentes de Presentación (Dumb UI): Web Database Transfer

[⬅️ Volver a la Documentación de la Feature](README.md) | [Siguiente: Hooks y Gestión de Estado ➡️](hooks.md)

---

## 1. Resumen de la Capa de Componentes

La capa de componentes visuales de `apps/web/src/features/database-transfer/components/` contiene las vistas y controles de interfaz necesarios para realizar exportaciones de seguridad y restauraciones asistidas sobre PostgreSQL.

### Certificación de Invariante de Red (Cero Red Directa)
Se certifica que los componentes visuales de este directorio respetan estrictamente la invariante de presentación:
- **Llamadas a `fetch`:** **0 encontradas**.
- **Instanciaciones de `WebSocket`:** **0 encontradas**.
- **Gestión de Red:** Todo el tráfico HTTP hacia los endpoints se delega en las funciones exportadas por `../api/database-transfer-api.ts`.

---

## 2. Catálogo de Componentes

### 2.1 Panel de Transferencia y Respaldo (`DatabaseTransferPanel.tsx`)
- **Cita:** `DatabaseTransferPanel.tsx:1-271`
- **Responsabilidad:** Orquesta la interfaz de usuario dividiéndola en dos secciones funcionales y un modal de confirmación:
  1. **Sección de Exportación:** Accesible para usuarios con rol `admin` y `owner`. Renderiza el botón `Exportar copia de seguridad` y gestiona la descarga asíncrona del volcado binario mediante un `Blob` de navegador.
  2. **Sección de Importación:**
     - Si el usuario **no es `owner`**, oculta o deshabilita los controles de carga y presenta un mensaje informativo de restricción:
       `"Solo el usuario propietario (owner) de la plataforma puede restaurar copias de seguridad."`
     - Si el usuario **es `owner`**, expone el selector de archivos (`<input type="file" accept=".dump">`), validando que el archivo no esté vacío y no supere el límite de 64 MiB.
- **Props:** No requiere props obligatorias.

---

### 2.2 Modal de Previsualización y Confirmación Tipada (`DatabaseImportDialog`)
- **Cita:** `DatabaseTransferPanel.tsx:196-270`
- **Mecanismo:** Utiliza el componente compartido `<Modal>` (`../../../shared/components/Modal/Modal.js`):
  - **Tabla Comparativa de Filas:** Muestra una cuadrícula detallando el estado de las 21 tablas relacionales del esquema:
    - Nombre de la tabla (`table`).
    - Filas actuales en la base de datos viva (`currentRows`).
    - Filas presentes en el volcado que sustituirán a las actuales (`importedRows`).
  - **Barrera de Confirmación Tipada ("IMPORTAR"):**
    - Presenta un campo de texto con la instrucción:
      `"Escribe IMPORTAR en mayúsculas para desbloquear la restauración definitiva."`
    - El botón `Confirmar importación` permanece estrictamente deshabilitado mediante la expresión (`DatabaseTransferPanel.tsx:245-266`):
      ```tsx
      disabled={busy || confirmation !== 'IMPORTAR'}
      ```
    - Únicamente tras teclear exactamente la palabra `"IMPORTAR"` se activa el botón destructivo.

---

### 2.3 Vista de Sesión Revocada (Post-Restauración)
- **Cita:** `DatabaseTransferPanel.tsx:86-98`
- **Mecanismo:** Al concluir con éxito la importación física (`completed === true`), el panel sustituye su contenido por una vista de estado final accesible:
  ```tsx
  <div className="database-transfer-completed" role="status">
    <h2>Restauración completada</h2>
    <p>
      La base de datos se ha restaurado correctamente. Todas las sesiones activas han sido
      revocadas por motivos de seguridad.
    </p>
    <a href="/api/v1/auth/discord" className="btn btn-primary">
      Iniciar sesión con Discord
    </a>
  </div>
  ```
  Esto guía al administrador de forma transparente a reautenticarse mediante OAuth2 sin dejar la aplicación en un estado inconsistente.

---

## 3. Estilos y Encapsulamiento Visual

El panel importa `components/database-transfer.css` (134 líneas), estructurado bajo la clase raíz `.rcl-site`:
- `.rcl-site .database-transfer-panel`: Tarjetas divididas con bordes sutiles y espaciado consistente.
- `.rcl-site .database-transfer-table`: Tabla compacta con columnas alineadas a la derecha para conteos numéricos.
- `.rcl-site .database-transfer-warning`: Contenedor de alerta con fondo ámbar/rojo para advertencias de sustitución destructiva.
- `.rcl-site .database-transfer-completed`: Vista centrada con tipografía destacada y botón de acción principal para reingreso.
