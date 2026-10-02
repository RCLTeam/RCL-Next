# Hooks Headless y Sincronización de Estado

[⬅️ Volver a Componentes](components.md) | [Siguiente: Vistas Ensambladoras ➡️](pages.md)

---

## 1. Visión General

El directorio `apps/web/src/features/competition/hooks/` contiene la capa de lógica headless de la competición. Estos hooks encapsulan las llamadas HTTP, el control de concurrencia, la cancelación de peticiones asíncronas y la sincronización reactiva entre selecciones de temporadas y divisiones.

Ningún componente visual gestiona peticiones de red de forma directa; todos delegan en estos hooks para obtener colecciones o entidades detalladas.

---

## 2. Catálogo de Hooks Headless

```
useCollection<T> (Primitiva base con AbortController)
  ├── useCompetitionSelection (Gestor de temporada y división activa)
  │     └── useCompetition (Fachada de alto nivel para recursos de liga)
  └── useCompetitionDetail (Gestor de entidades singulares con mapeo 'missing')
```

---

## 3. Especificación Técnica por Hook

### 3.1 `useCollection<T>`
**Archivo**: `apps/web/src/features/competition/hooks/useCollection.ts:1-32`  
**Firma**: `function useCollection<T>(path: string | null, revision: number): CollectionState<T>`

Es el bloque de construcción fundamental para cualquier consulta de listas en el cliente:

```typescript
// useCollection.ts:11-25
useEffect(() => {
  if (path === null) return;
  const controller = new AbortController();
  getCollection<T>(path, controller.signal).then(
    (data) => {
      if (!controller.signal.aborted)
        setResult({ path, revision, state: { status: 'ready', data } });
    },
    () => {
      if (!controller.signal.aborted)
        setResult({ path, revision, state: { status: 'error', data: [] } });
    }
  );
  return () => controller.abort();
}, [path, revision]);
```

#### Garantías Técnicas de `useCollection`
1. **Cancelación Automática ante Cambios de Filtro**: Si el usuario cambia rápidamente de división o se dispara una actualización manual de `revision`, la función de limpieza del efecto ejecuta `controller.abort()`, cancelando la petición HTTP en curso y evitando condiciones de carrera (*Race Conditions*).
2. **Protección Estricta contra Datos Residuales (*Stale Data Protection*)**:
   ```typescript
   // useCollection.ts:28-30
   return result?.path === path && result.revision === revision
     ? result.state
     : { status: 'loading', data: [] };
   ```
   Si la ruta solicitada no coincide exactamente con la del resultado almacenado en el estado interno, el hook no retorna datos de la división anterior; devuelve de inmediato `{ status: 'loading', data: [] }`, impidiendo que se muestren datos obsoletos durante las transiciones.

---

### 3.2 `useCompetitionSelection`
**Archivo**: `apps/web/src/features/competition/hooks/useCompetitionSelection.ts:1-50`  
**Firma**: `function useCompetitionSelection(enabled = true, currentOnly = false)`

Gestiona la selección jerárquica de temporadas y divisiones:

1. **Ordenación de Temporadas (`sortSeasons`)**:
   ```typescript
   export function sortSeasons(seasons: Season[]) {
     return [...seasons].sort(
       (a, b) =>
         Number(!b.endsOn) - Number(!a.endsOn) || (b.startsOn ?? '').localeCompare(a.startsOn ?? '')
     );
   }
   ```
   Sitúa en primer lugar aquellas temporadas que no tienen fecha de fin (`!endsOn`, es decir, temporadas activas o en curso), y posteriormente ordena por fecha de inicio descendente.
2. **Detección de la Temporada Activa (`currentSeason`)**:
   Evalúa la fecha actual en formato ISO canadiense (`today = new Date().toLocaleDateString('en-CA')`, formato `YYYY-MM-DD`). Localiza la temporada en curso comprobando que `startsOn <= today` y `endsOn >= today` (o sin fecha de cierre).
3. **Reinicio Reactivo de División (`selectSeason`)**:
   Cuando el usuario cambia de temporada (`selectSeason(id)`), el hook resetea automáticamente la división seleccionada (`setDivisionChoice('')`), forzando a que la aplicación seleccione la división principal de la nueva temporada elegida.
4. **Disparador de Reintento (`retry`)**:
   Incrementa el contador interno `revision`, obligando a todos los `useCollection` descendientes a invalidar su caché y reintentar las peticiones.

---

### 3.3 `useCompetition`
**Archivo**: `apps/web/src/features/competition/hooks/useCompetition.ts:1-37`  
**Firma**: `function useCompetition(resources = ['teams', 'rounds', 'calendar', 'standings'], currentOnly = false)`

Actúa como la fachada principal (*Facade Pattern*) consumida por las páginas de liga:

- Consume `useCompetitionSelection` para conocer la división seleccionada.
- Si existe una división activa, construye los prefijos correspondientes:
  - `divisions/:id/teams`
  - `divisions/:id/rounds`
  - `divisions/:id/calendar`
  - `divisions/:id/standings?stage=regular`
- Dispara en paralelo las consultas mediante cuatro instancias de `useCollection`.
- Expone un objeto unificado con las selecciones, los estados de datos y la función de reintento:
  ```typescript
  return {
    seasons: selection.seasons,
    season: selection.season,
    divisions: selection.divisions,
    division,
    selectSeason: selection.selectSeason,
    selectDivision: selection.selectDivision,
    retry: selection.retry,
    teams,
    rounds,
    calendar,
    standings
  };
  ```

---

### 3.4 `useCompetitionDetail`
**Archivo**: `apps/web/src/features/competition/hooks/useCompetitionDetail.ts:1-39`  
**Firma**: `function useCompetitionDetail<K>(resource: K, id: string)`

Especializado en la carga de entidades singulares para páginas de detalle (`matches`, `players`, `teams`):

- **Mapeo de Errores a Estado Semántico (`missing`)**:
  Si la llamada a `getCompetitionDetail` devuelve `null` (lo cual ocurre cuando el servidor responde HTTP 404 o 422 por identificador no encontrado o partido no finalizado), el hook asigna el estado `{ status: 'missing' }` (`línea 23`).
- **Comportamiento en UI**:
  Permite que las vistas de detalle distingan limpiamente entre:
  - `loading`: Cargando la entidad.
  - `error`: Fallo de conectividad con la red.
  - `missing`: El recurso no existe o no está disponible públicamente (activando una pantalla de 404 personalizada).
  - `ready`: Entidad cargada y disponible en `data`.
- Integra `AbortController` nativo para abortar la petición si el usuario navega a otro perfil antes de que finalice la carga.
