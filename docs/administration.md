# Administración de la competición

`/admin` es la entrada protegida. Tiene exactamente dos subpáginas:

- `/admin/rofl/upload`: importación de repeticiones y estadísticas con el flujo ROFL existente.
- `/admin/crud`: consulta, creación, edición y eliminación. Un selector cambia la entidad dentro de esta misma página.

## Orden habitual de configuración

1. Crear la temporada y las divisiones; vincularlas desde **Competiciones**.
2. Crear los equipos de cada competición.
3. Registrar los **Miembros** con su ID Discord y asociar sus cuentas Riot en **Jugadores**.
4. Asignar los miembros a equipos desde **Plantillas**, indicando rol y capitanía.
5. Crear jornadas y encuentros con equipos de la misma competición.
6. Importar los ROFL desde la otra subpágina.

La pantalla permite buscar y recorrer listados de 50 registros. Los selectores de relaciones también tienen búsqueda y carga de más opciones. Las jornadas y equipos de un encuentro se filtran por su competición; el ganador debe ser uno de sus participantes. Las fechas y horas se muestran en la zona horaria del navegador y se envían con zona horaria a la API.

## Reglas de edición

- Las claves naturales (nombre de temporada/división, ID Discord) y las claves compuestas de jornadas y plantillas no cambian al editar. Para trasladar una inscripción de plantilla, elimina la anterior y crea la nueva; ambas acciones quedan registradas.
- Las temporadas no tienen estado activo. El selector público usa por defecto la fecha de inicio más reciente; las temporadas sin fecha quedan al final y los empates se ordenan por nombre. El usuario puede elegir otra temporada.
- Solo puede existir un capitán por equipo y debe ocupar un rol de jugador titular.
- Una competición o equipo con datos dependientes no puede cambiar de ámbito. Los encuentros exigen equipos de la misma competición y una jornada de esa competición.
- Los resultados manuales validan Bo1/Bo3/Bo5, marcador y ganador. Los encuentros con mapas importados permiten cambiar jornada, programación, emisión y notas; el resultado pertenece al flujo ROFL.
- Un borrado requiere confirmación en pantalla y se rechaza si existen dependencias, incluso cuando el esquema permitiría eliminarlas en cascada. Los snapshots ROFL, sesiones, permisos e historial no se editan desde este panel.
- Si otro administrador o ROFL modifica un registro mientras está abierto, guardar o eliminar devuelve un conflicto. **Recargar datos** descarta el formulario abierto y recupera la versión vigente.

## Organización y persistencia

`apps/api/src/modules/crud-operations/` separa catálogo/validación, servicio, rutas e implementación PostgreSQL. `apps/web/src/features/crud-operations/` agrupa cliente HTTP, formularios, selección de entidad y listados; `site/pages/admin/` compone las dos subpáginas. Los contratos públicos están en `packages/contracts/src/crud-operations.ts`.

Cada escritura y su `audit_logs` se ejecutan en una transacción. Los cambios de plantilla también generan `roster_movements`. Las ediciones y los borrados bloquean el registro y comparan su `updatedAt` con precisión de microsegundos, compatible con los bloqueos de encuentro del importador ROFL. No cambia el esquema ni las migraciones existentes.

Todas las rutas requieren sesión Discord y rol `admin`; las escrituras exigen el `Origin` configurado. No se puede asignar un rol de acceso al crear o editar miembros: las identidades nuevas son `viewer` por defecto. La administración devuelve 503 si no está configurada la autenticación o el repositorio.

Las pruebas de integración HTTP/PGlite están en `tests/integration/crud-operations.test.ts`; cubren autenticación, origen, CRUD, auditoría, relaciones, resultados importados, edición obsoleta y paginación. Las pruebas no escriben en la base de desarrollo.
