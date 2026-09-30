# Módulo API: CRUD Operations Engine

[⬅️ Volver al Índice Principal de Documentación](../../../docs/README.md) | [Siguiente: API Database Transfer ➡️](../../../docs/api/database-transfer/README.md)

---

## 1. Resumen Ejecutivo

El módulo `apps/api/src/modules/crud-operations/` constituye el motor de administración dinámica de datos relacionales de RCL-Next. Proporciona una interfaz unificada, tipada y segura para la introspección, consulta, creación, actualización y borrado de entidades de la competición sobre PostgreSQL mediante Drizzle ORM.

El motor está diseñado bajo principios de máxima defensa de integridad referencial, seguridad de tipos en tiempo de ejecución y auditoría integral:

1. **Introspección y Catálogo Tipado de Recursos:** Expone 8 recursos administrativos mutables (`seasons`, `divisions`, `competitions`, `teams`, `players`, `memberships`, `rounds`, `matches`) y 1 recurso de catálogo en solo lectura (`users`), desacoplando la definición de esquemas de los controladores web (`crud-operations.resources.ts:60-249`).
2. **Inmutabilidad y Blindaje de Credenciales de Usuario:** El catálogo `users` (`schema.discordUsers`) está disponible exclusivamente para resolución de nombres en selectores foráneos (`/references/users`). Queda estrictamente vetado para mutaciones de creación, modificación o borrado a través del motor CRUD, garantizando que ninguna cuenta de usuario ni permiso de Discord pueda manipularse por esta vía (`postgres-crud-operations.repository.ts:408`).
3. **Planificador Determinista de Borrado en Cascada:** Resuelve de forma autónoma el grafo acíclico dirigido (DAG) de dependencias foráneas (`postgres-crud-delete-plan.ts:21-50`), previene referencias cíclicas (`deleted.has(id)`), impone un límite operativo duro de 10.000 filas y genera un digest criptográfico SHA-256 de confirmación.
4. **Concurrencia Optimista con Precisión de Microsegundos:** Detección de colisiones concurrentes basada en marcas temporales UTC con formato `YYYY-MM-DD"T"HH24:MI:SS.US"Z"`, rechazando cualquier mutación desactualizada con HTTP 409 `DATA_CONFLICT`.
5. **Efectos Colaterales Automáticos y Trazabilidad Universal:** Las mutaciones sobre plantillas deportivas (`memberships`) disparan inserciones auditables inmediatas en `roster_movements` (`joined`, `left`, `role_changed`, `promoted_to_captain`, `demoted_from_captain`), mientras que toda operación exitosa genera un registro inmutable en `audit_logs` con snapshots completos de estado previo y posterior.

---

## 2. Tabla de Contenidos del Módulo

| Documento | Enlace | Resumen Funcional |
|---|---|---|
| **Rutas y Capa de Transporte** | [routes.md](routes.md) | Endpoints de catálogo, consulta paginada, previsualización de borrado y mutaciones; cabeceras de caché `no-store` y control de acceso por roles. |
| **Lógica de Procesamiento y Algoritmos** | [processing.md](processing.md) | Planificador de borrado relacional, recorrido BFS, límite de 10.000 filas, digest SHA-256, orden topológico inverso y validaciones deportivas. |
| **Persistencia Relacional y Consultas** | [persistence.md](persistence.md) | Repositorio `PostgresCrudOperationsRepository`, mapeo Drizzle, bloqueo consultivo `noWait`, ranking de búsqueda y enriquecimiento foráneo en lote. |
| **Validación y Reglas de Dominio** | [validation.md](validation.md) | Esquemas Zod por recurso, reglas de integridad referencial, inmutabilidad de claves primarias y matriz de privilegios `admin` vs `owner`. |
| **Contratos y DTOs Compartidos** | [contracts.md](contracts.md) | Interfaces TypeScript exportadas (`CrudResource`, `CrudField`, `CrudRecord`, `CrudDeletePreview`, `CrudDeleteImpact`) en `@rcl/contracts`. |

---

## 3. Garantías de Fiabilidad y Reglas de Dominio

- **Disociación Estricta entre Gobernanza y Deporte:** El motor CRUD gestiona entidades organizativas de la liga y asignaciones de plantilla (`team_memberships`), pero no modifica los roles de acceso al sistema (`owner`, `admin`, `viewer`) definidos en `apps/api/src/modules/auth/`.
- **Protección Antidesbordamiento de Consultas:** La búsqueda textual aplica escape sistemático de comodines SQL (`%`, `_`, `\`) e impone paginación con tamaño de página fijo de 50 registros (`limit(51)`), señalizando `hasMore: boolean` para evitar lecturas masivas en memoria.
- **Rollback Transaccional Completo:** Si un registro dependiente en cascada o un efecto colateral de auditoría/movimiento falla durante la ejecución, toda la transacción de base de datos se revierte automáticamente, asegurando cero estados inconsistentes o huérfanos.
