# Cuadro de playoffs

[Volver a competición](README.md)

La página `/playoffs` presenta un cuadro de doble eliminación de seis equipos. Los datos y resultados se muestran en las propias casillas, sin un listado adicional de partidos.

## Formato

| Fase | Participantes | Destino |
| --- | --- | --- |
| Upper · Ronda 1 | Los cuatro primeros; el líder elige rival | Ganadores a final upper; perdedores a lower |
| Final upper | Ganadores de upper · Ronda 1 | Ganador a gran final; perdedor a final lower |
| Lower · Ronda 1 | 5.º y 6.º contra los perdedores iniciales del upper | Ganadores a lower · Ronda 2 |
| Lower · Ronda 2 | Ganadores de lower · Ronda 1 | Ganador a final lower |
| Final lower | Perdedor de final upper y ganador de lower · Ronda 2 | Ganador a gran final |
| Gran final | Ganadores de final upper y final lower | Campeón |

El formato previsto es BO5. Cada partido publicado muestra su valor real de `bestOf`; las casillas pendientes muestran BO5.

## Datos y asignación

`PlayoffsPage` obtiene calendario, jornadas y clasificación regular mediante `useCompetition`. `PlayoffFormat` llama a la función pura `buildPlayoff` de `playoff-model.ts`.

1. Se excluyen los partidos cancelados y se filtran partidos con `round.stage === 'playoff'` y se ordenan por secuencia de jornada e identificador.
2. Los dos cruces iniciales se buscan en la primera jornada publicada, excluyendo partidos del 5.º y 6.º. El cruce del líder se identifica por su equipo cuando está disponible.
3. `outcome` obtiene ganador y perdedor únicamente de partidos `completed` o `forfeit` usando primero `winnerTeamId`. Una incomparecencia exige un ganador explícito, incluso con marcador 0-0. Para resultados finalizados sin ese campo se conserva la comparación de marcadores desiguales; un identificador ajeno a los participantes no produce avances. Los partidos programados, en directo y cancelados no propagan equipos.
4. Las siguientes casillas se asignan por identidad de ambos participantes, sin reutilizar el mismo partido. Se respeta el orden local/visitante publicado y sus marcadores.
5. Los cruces iniciales de lower se identifican por el 5.º o 6.º y un perdedor confirmado del upper. La publicación manual determina qué perdedor se enfrenta a cada uno.
6. Si todavía no existe un partido posterior, se muestran los participantes que ya puedan deducirse; el resto mantiene su placeholder. No se decide automáticamente la elección de rival del líder ni el reparto inicial de los perdedores en lower.

La asignación presupone un calendario correspondiente a este formato, una clasificación regular disponible y los dos cruces iniciales en la primera jornada de playoffs. No existe un identificador explícito de casilla en la API: si faltan resultados previos o no se pueden identificar los participantes esperados, el partido posterior no se asigna todavía. El cuadro no es un editor de emparejamientos ni un motor genérico para otros formatos.

## Gestión manual y actualización

- Los administradores crean los enfrentamientos y publican sus resultados con las herramientas existentes.
- Si un equipo pierde en upper, el cliente reconoce su derrota cuando el resultado está cerrado. Para mostrar su primer enfrentamiento de lower, debe existir el partido publicado contra el 5.º o 6.º.
- No se crean registros, no se modifican emparejamientos y no se escribe en la API desde el cuadro.
- La proyección se recalcula al recibir datos. Esta página no añade sondeo periódico ni actualizaciones push; para recoger cambios externos se recarga la página o se vuelve a cargar la selección de competición.

## Presentación

- Cuadro ampliado al 150 %, con desplazamiento horizontal y acceso mediante teclado.
- Final upper alineada verticalmente con final lower; las conexiones de la gran final llegan al centro de cada fila de equipo.
- Escudos y nombres reales sustituyen los placeholders. Los marcadores solo se muestran en partidos en directo, finalizados o por incomparecencia.
- El ganador confirmado se destaca en lima. Estado y horario aparecen en la casilla; las fechas usan la zona horaria de la liga.
- Sin letras de cruce visibles, sin abreviar «Ronda» y sin leyenda adicional.
- Tres normas con los estilos compartidos de Predicciones: elección del líder, segunda oportunidad y series al mejor de cinco. Las explicaciones permanecen en una línea.

## Comprobaciones

```sh
pnpm --filter @rcl/web typecheck
pnpm exec biome check apps/web/src/site/pages/playoffs apps/web/src/site/routes.tsx
pnpm exec vitest run apps/web/src/site/pages/playoffs/playoff-model.test.ts apps/web/src/site/routes.test.tsx tests/unit/render/competition-pages.test.tsx
```

`playoff-model.test.ts` cubre las ocho casillas, orden local/visitante invertido, reencuentros entre equipos, propagación sin nuevos partidos, elección pendiente, exclusión de fase regular y estados que no deben producir avances. La suite de renderizado de competición utiliza `PlayoffFormat`, incluido el caso de equipos y marcadores incompletos.
