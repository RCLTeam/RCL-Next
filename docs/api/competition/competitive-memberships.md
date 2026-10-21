# Roles y contexto competitivo

## Regla compartida (fase 1)

`@rcl/contracts` exporta `ROSTER_ROLES`, `COMPETITIVE_ROLES`,
`NON_COMPETITIVE_ROLES`, sus tipos y sus predicados. API y web deben consumir
esta clasificación para distinguir participantes y otras vinculaciones.

- Competitivos: top, jungle, mid, adc, support y substitute. No requieren partidas.
- No competitivos: coach, staff y partners. Sus membresías se conservan.
- La capitanía no determina la clasificación. Su validación existente sigue
  permitiéndola solo en los cinco roles titulares, excluyendo suplentes.
- Una persona puede tener un único equipo competitivo por temporada entre todas
  las divisiones. La restricción de base de datos sigue siendo la autoridad ante
  escrituras concurrentes. Los equipos inactivos no liberan esa restricción.
- La membresía pertenece a la persona (Discord); las estadísticas siguen siendo
  por cuenta. Este criterio no agrega resultados de cuentas vinculadas.

## Selección de equipo y temporada

`competitiveTeamForSeason` recibe las membresías de una persona y una temporada
explícita. Solo devuelve su membresía competitiva en esa temporada o `null`.
El orden de entrada, la fecha de actualización y la capitanía no influyen.
Por defecto excluye equipos inactivos; `includeInactive: true` permite consultar
la afiliación histórica. Varias membresías competitivas en la misma temporada
producen un error, sin escoger arbitrariamente una de ellas.

Para integrar el contexto en las siguientes fases:

1. Una temporada seleccionada por el usuario fija el contexto. No sustituirla
   silenciosamente por otra temporada con datos.
2. «Equipo actual» exige una temporada vigente explícitamente resuelta y un
   equipo activo. `isActive` por sí solo no convierte una temporada en vigente.
   Si no hay temporada vigente inequívoca, no etiquetar un equipo como actual.
3. El último equipo competitivo se busca por fechas de temporada, nunca por
   orden alfabético ni por actualización de membresía. Puede incluir equipos
   inactivos, pero debe identificarse como histórico. Las fechas ausentes o
   empatadas no justifican afirmar que un equipo es el actual.
4. Sin selección explícita, el resumen estadístico usa la última temporada con
   inscripción competitiva; si no existe, la última con partidas o premios.
   Una inscripción competitiva sin partidas muestra «Sin partidas», sin mezclar
   otra temporada. Una afiliación no competitiva nunca fija esta elección.
5. El equipo registrado y el equipo de cada partida son conceptos distintos.
   Un cambio de rol no elimina ni reasigna partidas, estadísticas o premios.
6. Sin membresía competitiva, devolver y mostrar ausencia de equipo competitivo;
   nunca recurrir a coach, staff o partners como alternativa.

## Alcance

Esta fase centraliza los roles usados por los contratos, el formulario generado
por la API y la clasificación existente de jugadores y plantillas en la web.
Incluye el selector puro y sus pruebas. No requiere cambios de esquema ni migraciones.

## Perfil del backend (fase 2)

El servicio de detalle ya resuelve la inscripción con el selector compartido,
recorriendo las temporadas por fecha de inicio descendente (sin fecha al final;
el nombre solo desempata de forma estable). No usa el orden de las membresías.
Los empates no implican que un equipo sea actual.

La respuesta añade dos campos, opcionales en el contrato por compatibilidad
con los consumidores existentes, pero siempre presentes en el detalle de la API:

- `registrationTeam`: última inscripción competitiva, con rol, capitanía,
  temporada, división, estado y slug; `null` si no existe. Puede ser histórica
  o inactiva y no se etiqueta como equipo actual.
- `statisticsSeasonName`: temporada del resumen estadístico y los premios;
  `null` cuando no hay inscripción competitiva ni resultados.

`competition.team`, `role` e `isCaptain` reflejan esa inscripción competitiva.
Si solo quedan relaciones no competitivas, esos campos quedan vacíos y se busca
la última temporada con partidas o premios. Sin resultados se devuelve un
contexto vacío, sin reutilizar proyecciones antiguas. Una inscripción sin partidas
mantiene su temporada y estadísticas nulas. Las partidas siguen conservando su
equipo de origen y se agregan por cuenta y temporada, incluso después de un cambio
de equipo o rol. `teams` conserva todas las afiliaciones y su orden original.

## Listados por división (fase 3)

La consulta de membresías de `/divisions/:id/players` solo admite roles
competitivos de esa división y temporada para incluir personas sin resultados.
Los seis roles, incluidos suplentes sin partidas, conservan su equipo y rol de
inscripción. Una afiliación de staff en otro equipo no altera estos campos.

Las partidas y premios históricos siguen siendo vías independientes de inclusión:
pasar a coach, staff o partner no elimina a un participante del listado histórico.
El equipo y posición de las partidas siguen siendo los registrados en ellas;
una membresía no competitiva no completa ni sobrescribe ese contexto. Con premios
pero sin partidas ni inscripción competitiva, equipo y rol quedan vacíos.

El filtro de posición acepta únicamente roles competitivos; «Todos» conserva
participantes con estadísticas o premios. Búsqueda, ordenación y contador usan
el resultado filtrado. La página dispone de filtros de temporada, división,
posición y búsqueda por nombre/Riot ID; no tiene un selector de equipo.
La API sigue mostrando solo cuentas principales, sin duplicar personas por sus
cuentas secundarias. El directorio general sin división conserva su función de
resolver perfiles y slugs.

## Perfil visual (fase 4)

La cabecera usa exclusivamente `registrationTeam` para escudo, enlace, color,
posición y capitanía. Se presenta como «Última inscripción competitiva», sin
afirmar que sea el equipo actual; las inscripciones inactivas se identifican.
Sin inscripción se muestra «Sin equipo competitivo», iniciales y color neutro.
No se recurre a `teams[0]` si los campos opcionales del contexto no están presentes.

Rendimiento muestra `statisticsSeasonName`, aunque el jugador ya no tenga equipo.
Sin resultados aparece «Sin partidas registradas». Si existen MVPs pero faltan
estadísticas de partidas, se mantienen los premios y se explica la ausencia de
estadísticas. Todas las afiliaciones y cuentas vinculadas siguen accesibles.

## Trayectoria y otras vinculaciones (fase 5)

El perfil divide las membresías con los predicados compartidos en «Trayectoria
competitiva» (los cinco roles titulares y suplentes) y «Otras vinculaciones»
(coach, staff y partners). Ambas secciones tienen contador y estado vacío propios;
el resumen también distingue inscripciones competitivas de otras vinculaciones.

Cada tarjeta conserva enlace, escudo, temporada, división, rol y capitanía,
e indica si el equipo está activo o inactivo. Solo la inscripción resuelta por
la API recibe la etiqueta «Última inscripción competitiva». Un equipo activo
no implica que la inscripción sea actual. Se mantiene el orden recibido de la API
dentro de cada sección, sin reordenar ni modificar las membresías originales.

La trayectoria muestra las inscripciones conservadas en el sistema; no reconstruye
membresías eliminadas ni roles anteriores a partir de partidas o del registro de
auditoría. Las estadísticas históricas permanecen disponibles en Rendimiento.
