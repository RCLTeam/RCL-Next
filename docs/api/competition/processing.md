# Lógica de Procesamiento y Algoritmos del Dominio

[⬅️ Volver a Rutas](routes.md) | [Siguiente: Persistencia ➡️](persistence.md)

---

## 1. Visión General

El archivo `apps/api/src/modules/competition/` concentra la lógica algorítmica y matemática de las competiciones de League of Legends en RCL-Next. Sus responsabilidades se dividen en cinco motores y especificaciones independientes y puras:
1. **Motor de Clasificación y Desempates de Liga (`competition.service.ts:18-60`)**: Cómputo de la tabla de posiciones en series al mejor de 3 (BO3).
2. **Motor de Puntuación Multidimensional de MVP (`player-statistics.ts:43-276`)**: Evaluación del rendimiento individual continuo por rol y selección del mejor jugador.
3. **Motor de Estadísticas Agregadas de Campeones (`champion-stats.ts:1-32`)**: Consolidación de selecciones, mapas disputados, victorias y porcentajes de presencia.
4. **Generador Determinista de Slugs y Evasión de Colisiones (`profile-slugs.ts:1-60`)**: Normalización semántica de URLs para partidos, equipos y jugadores.
5. **Especificación de Visibilidad de Equipos y Sentinels de Roles (`team-visibility.ts:1-16`)**: Determinación del estado de los equipos mediante rangos numéricos de roles de Discord para su inclusión en clasificación, cuadrícula, calendario y pronósticos.

---

## 2. Motor de Clasificación de Liga y Reglas de Desempate

### 2.1 Algoritmo de Acumulación (`calculateStandings`)
La función pura `calculateStandings(teams, matches)` (`competition.service.ts:18-60`) procesa los resultados de los partidos disputados en la fase indicada (por defecto `'regular'`):

```typescript
// apps/api/src/modules/competition/competition.service.ts:18-60
export function calculateStandings(teams: Team[], matches: Match[]) {
  const totals = new Map(
    teams.map((team) => [
      team.id,
      {
        team,
        played: 0,
        wins: 0,
        losses: 0,
        mapsWon: 0,
        mapsLost: 0,
        mapDifference: 0
      }
    ])
  );
  for (const match of matches) {
    if (!['completed', 'forfeit'].includes(match.status) || !match.winnerTeamId) continue;
    const home = totals.get(match.homeTeamId);
    const away = totals.get(match.awayTeamId);
    if (!home || !away) continue;
    for (const [team, won, lost] of [
      [home, match.homeScore, match.awayScore],
      [away, match.awayScore, match.homeScore]
    ] as const) {
      team.played++;
      team.wins += Number(match.winnerTeamId === team.team.id);
      team.losses += Number(match.winnerTeamId !== team.team.id);
      team.mapsWon += won;
      team.mapsLost += lost;
      team.mapDifference = team.mapsWon - team.mapsLost;
    }
  }
  // Rank by series wins, then map difference, fewer losses and team name.
  return [...totals.values()]
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.mapDifference - a.mapDifference ||
        a.losses - b.losses ||
        a.team.name.localeCompare(b.team.name, 'es')
    )
    .map((row, index) => ({ position: index + 1, ...row }));
}
```

### 2.2 Cascada Estricta de 4 Niveles de Ordenación
El orden de los equipos en la tabla de clasificación responde a la siguiente evaluación jerárquica (`competition.service.ts:52-58`):

1. **Nivel 1 — Victorias de Serie (`b.wins - a.wins`):**
   - Número total de series completas ganadas.
2. **Nivel 2 — Diferencia Neta de Mapas (`b.mapDifference - a.mapDifference`):**
   - Calculada como `mapsWon - mapsLost`. En un formato BO3, un resultado de 2-0 aporta `+2`, mientras que un 2-1 aporta `+1`.
3. **Nivel 3 — Menor Número de Derrotas (`a.losses - b.losses`):**
   - Número total de series perdidas (prioriza al equipo con menos derrotas).
4. **Nivel 4 — Desempate Determinista Alfabético (`a.team.name.localeCompare(b.team.name, 'es')`):**
   - Ordenación lexicográfica por nombre de equipo bajo el locale español (`'es'`).

### 2.3 Reglas de Desempate y Ausencia de Head-to-Head
- **Ausencia de Enfrentamiento Directo:** El sistema **no implementa desempate por enfrentamiento directo (*Head-to-Head*)**. Si dos equipos empatan en diferencia de mapas, victorias y derrotas, su posición relativa no se decide por el resultado del partido entre ellos, sino por el orden alfabético de sus nombres (`competition.service.ts:57`).
- **Ausencia de Mini-liga:** El sistema **no implementa desempate por mini-liga olímpica** para empates triples o cuádruples.
- **Ausencia de Rachas:** El sistema **no realiza seguimiento ni expone rachas de victorias/derrotas (*streaks*)**. El tipo de contrato `Standing` carece de dicho atributo.

---

## 3. Algoritmo Multidimensional de Puntuación MVP

El motor de rendimiento individual (`apps/api/src/modules/competition/player-statistics.ts:43-276`) calcula la puntuación global de cada jugador por cada serie completada y consolida las métricas base del perfil.

### 3.0 Métricas Base de Agregación de Estadísticas de Jugador (`aggregatePlayerStats`)
La función pura `aggregatePlayerStats(rows: PlayerGameRow[], all: PlayerGameRow[] | TeamKills)` (`player-statistics.ts:61-92`) consolida el rendimiento estadístico base de un jugador a lo largo de un conjunto de partidas (mapas disputados en una serie o a lo largo de la temporada completa), retornando el contrato `PlayerStatistics`:

```typescript
// apps/api/src/modules/competition/player-statistics.ts:61-92
export function aggregatePlayerStats(
  rows: PlayerGameRow[],
  all: PlayerGameRow[] | TeamKills
): PlayerStatistics {
  const sum = (key: 'kills' | 'deaths' | 'assists' | 'cs' | 'damageToChampions') =>
    rows.reduce((total, row) => total + row[key], 0);
  const timed = rows.filter((row) => row.durationSeconds && row.durationSeconds > 0);
  const minutes = timed.reduce((total, row) => total + (row.durationSeconds ?? 0) / 60, 0);
  const rate = (key: 'cs' | 'damageToChampions') =>
    minutes ? timed.reduce((total, row) => total + row[key], 0) / minutes : null;
  const average = (key: 'visionScore' | 'damageMitigated') => {
    const values = rows.flatMap((row) => (row[key] === null ? [] : [row[key]]));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const index = killsContext(all);
  const teamKills = rows.reduce(
    (total, row) => total + (index.get(row.gameId)?.get(row.teamId) ?? 0),
    0
  );
  return {
    games: rows.length,
    kda: (sum('kills') + sum('assists')) / Math.max(1, sum('deaths')),
    csPerMinute: rate('cs'),
    killParticipation: teamKills ? (100 * (sum('kills') + sum('assists'))) / teamKills : 0,
    winRate: rows.length
      ? (100 * rows.filter((row) => row.teamId === row.winnerTeamId).length) / rows.length
      : 0,
    damagePerMinute: rate('damageToChampions'),
    visionScore: average('visionScore'),
    damageMitigated: average('damageMitigated')
  };
}
```

Las bajas de equipo se indexan una vez por `(gameId, teamId)` y el índice se reutiliza en el cálculo de cada mapa, candidato y perfil. No se recorre todo el historial por cada mapa.

El motor calcula formalmente 7 métricas agregadas:

1. **KDA (`kda`, `player-statistics.ts:82`):** Ratio de asesinatos y asistencias frente a muertes:
   $$\text{KDA} = \frac{\sum \text{kills} + \sum \text{assists}}{\max(1, \sum \text{deaths})}$$
   Si el jugador no registra muertes ($\sum \text{deaths} = 0$), el denominador se trunca a $1$ mediante `Math.max(1, sum('deaths'))`, evitando divisiones por cero o valores indeterminados.

2. **CS por minuto (`csPerMinute`, `player-statistics.ts:69-70, 83`):** Ritmo de súbditos por minuto sobre partidas finalizadas con duración registrada:
   $$\text{CSPM} = \begin{cases} \frac{\sum_{r \in \text{timed}} r.\text{cs}}{\sum_{r \in \text{timed}} \frac{r.\text{durationSeconds}}{60}} & \text{si } \text{minutes} > 0 \\ \text{null} & \text{si } \text{minutes} = 0 \end{cases}$$
   Donde $\text{timed} = \{ r \in \text{rows} \mid r.\text{durationSeconds} > 0 \}$. Se calcula estrictamente sobre partidas con `durationSeconds > 0`. Si no se dispone de minutos válidos acumulados (`minutes === 0`), devuelve `null`.

3. **Kill Participation (`killParticipation`, `player-statistics.ts:75-84`):** Porcentaje de bajas totales del equipo en las que el jugador participó:
   $$\text{KP} = \begin{cases} \frac{100 \cdot (\sum \text{kills} + \sum \text{assists})}{\text{teamKills}} & \text{si } \text{teamKills} > 0 \\ 0 & \text{si } \text{teamKills} = 0 \end{cases}$$
   Donde $\text{teamKills}$ computa las muertes totales del equipo obtenidas del parámetro `all` en los mismos mapas disputados (`líneas 59-66`). Si el equipo no consiguió ninguna baja (`teamKills === 0`), devuelve `0`.

4. **WinRate (`winRate`, `player-statistics.ts:85-87`):** Porcentaje de mapas ganados respecto al total disputado:
   $$\text{WinRate} = \begin{cases} \frac{100 \cdot |\{ r \in \text{rows} \mid r.\text{teamId} = r.\text{winnerTeamId} \}|}{|\text{rows}|} & \text{si } |\text{rows}| > 0 \\ 0 & \text{si } |\text{rows}| = 0 \end{cases}$$

5. **DPM (`damagePerMinute`, `player-statistics.ts:69-70, 88`):** Daño total infligido a campeones por minuto de juego:
   $$\text{DPM} = \begin{cases} \frac{\sum_{r \in \text{timed}} r.\text{damageToChampions}}{\sum_{r \in \text{timed}} \frac{r.\text{durationSeconds}}{60}} & \text{si } \text{minutes} > 0 \\ \text{null} & \text{si } \text{minutes} = 0 \end{cases}$$
   Calculado de forma homóloga a CSPM sobre las partidas temporizadas (`durationSeconds > 0`), devolviendo `null` si `minutes === 0`.

6. **Puntuación media de visión por partida (`visionScore`, `player-statistics.ts:71-74, 89`):** Promedio aritmético sobre partidas válidas con registro de visión:
   $$\overline{\text{Vision}} = \begin{cases} \frac{\sum_{r \in \text{rows}, r.\text{visionScore} \ne \text{null}} r.\text{visionScore}}{|\{ r \in \text{rows} \mid r.\text{visionScore} \ne \text{null} \}|} & \text{si existen registros no nulos} \\ \text{null} & \text{en caso contrario} \end{cases}$$

7. **Daño mitigado medio por partida (`damageMitigated`, `player-statistics.ts:71-74, 90`):** Promedio aritmético sobre partidas válidas con registro de mitigación defensiva:
   $$\overline{\text{Mitigation}} = \begin{cases} \frac{\sum_{r \in \text{rows}, r.\text{damageMitigated} \ne \text{null}} r.\text{damageMitigated}}{|\{ r \in \text{rows} \mid r.\text{damageMitigated} \ne \text{null} \}|} & \text{si existen registros no nulos} \\ \text{null} & \text{en caso contrario} \end{cases}$$

#### Distinción Arquitectónica: Agregación de Perfil vs. Calibración de MVP
Existe una distinción conceptual deliberada entre ambas funciones:
- **`aggregatePlayerStats` (Perfil General del Jugador):** Computa la visión y el daño mitigado como **promedios aritméticos directos por partida** (`average('visionScore')` y `average('damageMitigated')` en `líneas 55-58, 76-77`). Esto proporciona métricas representativas del impacto medio absoluto de un jugador por mapa en la interfaz de perfil.
- **`mapMvpScore` (Calibración de Rendimiento):** Computa la visión y la mitigación **por minuto** (`vspm` y `mitigationPm` en `player-statistics.ts:144-145`, dividiendo el valor de cada mapa entre `minutes`). Esto permite contrastar el rendimiento con granularidad temporal frente a las constantes `vspm` y `mitigationPm` de cada rol táctico en `ROLE_REFERENCES`, desacoplando la puntuación de la duración de la partida.

### 3.1 Tablas de Referencia por Rol (`ROLE_REFERENCES` y `DEFAULT_REF`)
Las métricas individuales de cada jugador se evalúan frente a valores estándar de referencia calibrados específicamente para su rol táctico (`player-statistics.ts:103-118`). Si la posición del jugador no está definida o no coincide con los roles estándar, se aplican automáticamente los valores de corte de `DEFAULT_REF`:

| Posición | CSPM (Súbditos/min) | DPM (Daño/min) | GPM (Oro/min) | VSPM (Visión/min) | Mitigación/min | DPG (Daño por 1.000 de Oro) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **`top`** | 7.5 | 650 | 380 | 1.0 | 1100 | 1600 |
| **`jungle`** | 5.8 | 500 | 360 | 1.5 | 950 | 1350 |
| **`mid`** | 8.0 | 750 | 420 | 1.1 | 650 | 1750 |
| **`adc`** | 8.5 | 850 | 450 | 0.9 | 450 | 1850 |
| **`support`** | 1.2 | 250 | 260 | 2.3 | 650 | 900 |
| **`DEFAULT`** | 6.5 | 600 | 370 | 1.2 | 750 | 1500 |

### 3.2 Función de Escalado Continuo Logarítmico (`dynamicScale`)
Para evitar la inflación artificial producida por partidas atípicamente prolongadas o con intercambios desproporcionados de daño, los ratios relativos se atenúan mediante una curva continua cóncava logarítmica en base 2 (`player-statistics.ts:121-125`).

La función matemática a trozos formaliza el comportamiento del escalado continuo:

$$\text{scale}(v, r) = \begin{cases} 0 & \text{si } v \le 0 \\ \frac{v}{r} & \text{si } 0 < v \le r \\ 1 + 0.28 \cdot \log_2\left(\frac{v}{r}\right) & \text{si } v > r \end{cases}$$

Implementación técnica en TypeScript:

```typescript
// apps/api/src/modules/competition/player-statistics.ts:121-125
function dynamicScale(value: number | null, reference: number): number {
  if (!value || value <= 0 || reference <= 0) return 0;
  const ratio = value / reference;
  return ratio <= 1 ? ratio : 1 + Math.log2(ratio) * 0.28;
}
```

*Propiedades matemáticas del escalado continuo*:
- **Régimen Lineal Proporcional ($0 < v \le r$):** Para rendimientos iguales o inferiores a la referencia del rol, la escala progresa de forma puramente lineal: $\text{scale}(v, r) = \frac{v}{r}$.
- **Crecimiento Cóncavo y Rendimientos Decrecientes ($v > r$):** Cuando el jugador supera la referencia (*overperformance*), la función pasa a un régimen logarítmico cóncavo amortiguado por el coeficiente $0.28$. Esto recompensa el rendimiento superlativo sin permitir que una única estadística anómala (ej. partidas con asedios interminables o inflado artificial de daño en el juego tardío) distorsione el balance multidimensional del cálculo.
- **Continuidad en la Frontera:** En el punto crítico $v = r$, ambos regímenes convergen sin saltos discontinuos:
  $$\lim_{v \to r^-} \text{scale}(v, r) = 1, \quad \lim_{v \to r^+} \text{scale}(v, r) = 1 + 0.28 \cdot \log_2(1) = 1$$

### 3.3 Matriz Ponderada de 9 Dimensiones
El motor consolida 9 dimensiones evaluadas de forma independiente (`player-statistics.ts:148-166`), con pesos asignados de acuerdo con su impacto en la victoria:

- **KDA ($S_{\text{KDA}}$):** Ponderación base 20 con referencia fija de 4.5:
  $$S_{\text{KDA}} = 20 \cdot \text{scale}(\text{kda}, 4.5)$$
  *(Cita: `player-statistics.ts:148, 158`)*
- **Participación en Asesinatos ($S_{\text{KP}}$):** Ponderación base 18 con referencia fija de 65%:
  $$S_{\text{KP}} = 18 \cdot \text{scale}(\text{KP}, 65)$$
  *(Cita: `player-statistics.ts:149, 159`)*
- **Daño por Minuto ($S_{\text{DPM}}$):** Ponderación base 14 ajustada a la referencia del rol ($R_{\text{dpm}}$):
  $$S_{\text{DPM}} = 14 \cdot \text{scale}(\text{DPM}, R_{\text{dpm}})$$
  *(Cita: `player-statistics.ts:150, 160`)*
- **Eficiencia Económica de Daño ($S_{\text{DPG}}$):** Ponderación base 10 con fallback a la escala de DPM si no se dispone de registro de oro:
  $$S_{\text{DPG}} = \begin{cases} 10 \cdot \text{scale}(\text{DPG}, R_{\text{dpg}}) & \text{si } \text{Gold}_{\text{total}} > 0 \\ 10 \cdot \text{scale}(\text{DPM}, R_{\text{dpm}}) & \text{si } \text{Gold}_{\text{total}} \le 0 \end{cases}$$
  *(Cita: `player-statistics.ts:151, 161`)*
- **Puntuación de Visión por Minuto ($S_{\text{Vision}}$):** Ponderación base 10 ajustada a la referencia del rol ($R_{\text{vspm}}$):
  $$S_{\text{Vision}} = 10 \cdot \text{scale}(\text{VSPM}, R_{\text{vspm}})$$
  *(Cita: `player-statistics.ts:152, 162`)*
- **Súbditos por Minuto ($S_{\text{CS}}$):** Ponderación base 7 ajustada a la referencia del rol ($R_{\text{cspm}}$):
  $$S_{\text{CS}} = 7 \cdot \text{scale}(\text{CSPM}, R_{\text{cspm}})$$
  *(Cita: `player-statistics.ts:153, 163`)*
- **Daño Mitigado por Minuto ($S_{\text{Mitigation}}$):** Ponderación base 6 ajustada a la referencia del rol ($R_{\text{mitigationPm}}$):
  $$S_{\text{Mitigation}} = 6 \cdot \text{scale}(\text{Mitigation}_{\text{pm}}, R_{\text{mitigationPm}})$$
  *(Cita: `player-statistics.ts:154, 164`)*
- **Oro por Minuto ($S_{\text{GPM}}$):** Ponderación base 5 con fallback a la escala de CSPM si no se dispone de registro de oro:
  $$S_{\text{GPM}} = \begin{cases} 5 \cdot \text{scale}(\text{GPM}, R_{\text{gpm}}) & \text{si } \text{Gold}_{\text{total}} > 0 \\ 5 \cdot \text{scale}(\text{CSPM}, R_{\text{cspm}}) & \text{si } \text{Gold}_{\text{total}} \le 0 \end{cases}$$
  *(Cita: `player-statistics.ts:155, 165`)*
- **Tasa de Victorias ($S_{\text{WinRate}}$):** Aporte lineal directo ponderado sobre 10 puntos:
  $$S_{\text{WinRate}} = 10 \cdot \left(\frac{\text{WinRate}}{100}\right)$$
  *(Cita: `player-statistics.ts:166`)*

#### Expresión de Consolidación Acumulada
La puntuación bruta acumulada suma directamente las 9 dimensiones:

$$\text{Score}_{\text{MVP}} = S_{\text{KDA}} + S_{\text{KP}} + S_{\text{DPM}} + S_{\text{DPG}} + S_{\text{Vision}} + S_{\text{CS}} + S_{\text{Mitigation}} + S_{\text{GPM}} + S_{\text{WinRate}}$$

### 3.3.1 Desglose Algebraico Explícito por Rol Táctico (Top, Jungle, Mid, ADC, Support, Default)

Al sustituir los vectores de parámetros específicos de `ROLE_REFERENCES` y `DEFAULT_REF` (`player-statistics.ts:103-118`) en la expresión general consolidada, se obtienen las ecuaciones algebraicas expandidas para cada una de las 6 posiciones tácticas:

1. **Score TOP ($R_{\text{dpm}}=650$, $R_{\text{dpg}}=1600$, $R_{\text{vspm}}=1.0$, $R_{\text{cspm}}=7.5$, $R_{\text{mitigationPm}}=1100$, $R_{\text{gpm}}=380$):**
   $$\begin{aligned}
   \text{Score}_{\text{TOP}} = \; & 20 \cdot \text{scale}(\text{KDA}, 4.5) + 18 \cdot \text{scale}(\text{KP}, 65) \\
   & + 14 \cdot \text{scale}(\text{DPM}, 650) + 10 \cdot \text{scale}(\text{DPG}, 1600) \\
   & + 10 \cdot \text{scale}(\text{VSPM}, 1.0) + 7 \cdot \text{scale}(\text{CSPM}, 7.5) \\
   & + 6 \cdot \text{scale}(\text{Mitigation}_{\text{pm}}, 1100) + 5 \cdot \text{scale}(\text{GPM}, 380) \\
   & + 10 \cdot \left(\frac{\text{WinRate}}{100}\right)
   \end{aligned}$$

2. **Score JUNGLE ($R_{\text{dpm}}=500$, $R_{\text{dpg}}=1350$, $R_{\text{vspm}}=1.5$, $R_{\text{cspm}}=5.8$, $R_{\text{mitigationPm}}=950$, $R_{\text{gpm}}=360$):**
   $$\begin{aligned}
   \text{Score}_{\text{JUNGLE}} = \; & 20 \cdot \text{scale}(\text{KDA}, 4.5) + 18 \cdot \text{scale}(\text{KP}, 65) \\
   & + 14 \cdot \text{scale}(\text{DPM}, 500) + 10 \cdot \text{scale}(\text{DPG}, 1350) \\
   & + 10 \cdot \text{scale}(\text{VSPM}, 1.5) + 7 \cdot \text{scale}(\text{CSPM}, 5.8) \\
   & + 6 \cdot \text{scale}(\text{Mitigation}_{\text{pm}}, 950) + 5 \cdot \text{scale}(\text{GPM}, 360) \\
   & + 10 \cdot \left(\frac{\text{WinRate}}{100}\right)
   \end{aligned}$$

3. **Score MID ($R_{\text{dpm}}=750$, $R_{\text{dpg}}=1750$, $R_{\text{vspm}}=1.1$, $R_{\text{cspm}}=8.0$, $R_{\text{mitigationPm}}=650$, $R_{\text{gpm}}=420$):**
   $$\begin{aligned}
   \text{Score}_{\text{MID}} = \; & 20 \cdot \text{scale}(\text{KDA}, 4.5) + 18 \cdot \text{scale}(\text{KP}, 65) \\
   & + 14 \cdot \text{scale}(\text{DPM}, 750) + 10 \cdot \text{scale}(\text{DPG}, 1750) \\
   & + 10 \cdot \text{scale}(\text{VSPM}, 1.1) + 7 \cdot \text{scale}(\text{CSPM}, 8.0) \\
   & + 6 \cdot \text{scale}(\text{Mitigation}_{\text{pm}}, 650) + 5 \cdot \text{scale}(\text{GPM}, 420) \\
   & + 10 \cdot \left(\frac{\text{WinRate}}{100}\right)
   \end{aligned}$$

4. **Score ADC ($R_{\text{dpm}}=850$, $R_{\text{dpg}}=1850$, $R_{\text{vspm}}=0.9$, $R_{\text{cspm}}=8.5$, $R_{\text{mitigationPm}}=450$, $R_{\text{gpm}}=450$):**
   $$\begin{aligned}
   \text{Score}_{\text{ADC}} = \; & 20 \cdot \text{scale}(\text{KDA}, 4.5) + 18 \cdot \text{scale}(\text{KP}, 65) \\
   & + 14 \cdot \text{scale}(\text{DPM}, 850) + 10 \cdot \text{scale}(\text{DPG}, 1850) \\
   & + 10 \cdot \text{scale}(\text{VSPM}, 0.9) + 7 \cdot \text{scale}(\text{CSPM}, 8.5) \\
   & + 6 \cdot \text{scale}(\text{Mitigation}_{\text{pm}}, 450) + 5 \cdot \text{scale}(\text{GPM}, 450) \\
   & + 10 \cdot \left(\frac{\text{WinRate}}{100}\right)
   \end{aligned}$$

5. **Score SUPPORT ($R_{\text{dpm}}=250$, $R_{\text{dpg}}=900$, $R_{\text{vspm}}=2.3$, $R_{\text{cspm}}=1.2$, $R_{\text{mitigationPm}}=650$, $R_{\text{gpm}}=260$):**
   $$\begin{aligned}
   \text{Score}_{\text{SUPPORT}} = \; & 20 \cdot \text{scale}(\text{KDA}, 4.5) + 18 \cdot \text{scale}(\text{KP}, 65) \\
   & + 14 \cdot \text{scale}(\text{DPM}, 250) + 10 \cdot \text{scale}(\text{DPG}, 900) \\
   & + 10 \cdot \text{scale}(\text{VSPM}, 2.3) + 7 \cdot \text{scale}(\text{CSPM}, 1.2) \\
   & + 6 \cdot \text{scale}(\text{Mitigation}_{\text{pm}}, 650) + 5 \cdot \text{scale}(\text{GPM}, 260) \\
   & + 10 \cdot \left(\frac{\text{WinRate}}{100}\right)
   \end{aligned}$$

6. **Score DEFAULT ($R_{\text{dpm}}=600$, $R_{\text{dpg}}=1500$, $R_{\text{vspm}}=1.2$, $R_{\text{cspm}}=6.5$, $R_{\text{mitigationPm}}=750$, $R_{\text{gpm}}=370$):**
   $$\begin{aligned}
   \text{Score}_{\text{DEFAULT}} = \; & 20 \cdot \text{scale}(\text{KDA}, 4.5) + 18 \cdot \text{scale}(\text{KP}, 65) \\
   & + 14 \cdot \text{scale}(\text{DPM}, 600) + 10 \cdot \text{scale}(\text{DPG}, 1500) \\
   & + 10 \cdot \text{scale}(\text{VSPM}, 1.2) + 7 \cdot \text{scale}(\text{CSPM}, 6.5) \\
   & + 6 \cdot \text{scale}(\text{Mitigation}_{\text{pm}}, 750) + 5 \cdot \text{scale}(\text{GPM}, 370) \\
   & + 10 \cdot \left(\frac{\text{WinRate}}{100}\right)
   \end{aligned}$$

*Degradación por Ausencia de Registro Económico:* Si en cualquiera de los roles se carece de registro de oro acumulado ($\text{Gold}_{\text{total}} \le 0$), el término de DPG degrada a $10 \cdot \text{scale}(\text{DPM}, R_{\text{dpm}})$ y el término de GPM degrada a $5 \cdot \text{scale}(\text{CSPM}, R_{\text{cspm}})$.

#### Posición táctica por mapa

`mapMvpScore(row, all)` aplica `playerRole(row.position)` y las referencias de ese mapa concreto. Las consultas leen exclusivamente `player_game_info.position`; una posición ausente utiliza `DEFAULT_REF`, sin recurrir al rol de plantilla. Un cambio de rol entre mapas se evalúa con el baremo correspondiente en cada uno.
### 3.4 Ejemplo Práctico de Cálculo Paso a Paso
A continuación se ilustra la resolución completa para un jugador en la posición **ADC** en una partida de 30 minutos (1.800 segundos), contrastando sus estadísticas contra las referencias `ROLE_REFERENCES.adc` ($R_{\text{cspm}} = 8.5$, $R_{\text{dpm}} = 850$, $R_{\text{gpm}} = 450$, $R_{\text{vspm}} = 0.9$, $R_{\text{mitigationPm}} = 450$, $R_{\text{dpg}} = 1850$):

#### Datos de Entrada
- **Kills / Deaths / Assists:** 10 / 2 / 8 $\to \text{KDA} = \frac{10 + 8}{2} = 9.0$ (Referencia: $4.5$)
- **Kill Participation:** $70\%$ (Referencia: $65\%$)
- **Daño por Minuto:** $935\text{ DPM}$ (Referencia: $850$)
- **Oro Ganado Total:** $14.850\text{ oro} \to \text{GPM} = \frac{14.850}{30} = 495\text{ Gold/min}$ (Referencia: $450$)
- **Daño Total a Campeones:** $28.050\text{ daño} \to \text{DPG} = \frac{28.050}{14.850} \times 1.000 = 1.888,89\text{ Dmg/1k Gold}$ (Referencia: $1.850$)
- **CS por Minuto:** $9.35\text{ CS/min}$ (Referencia: $8.5$)
- **Visión por Minuto:** $0.99\text{ VSPM}$ (Referencia: $0.9$)
- **Mitigación por Minuto:** $405\text{ Mit/min}$ (Referencia: $450$)
- **Resultado:** Victoria $\to \text{WinRate} = 100\%$

#### Cálculos Paso a Paso de las 9 Dimensiones
1. **KDA:** $\text{ratio} = \frac{9.0}{4.5} = 2.0$. Al superar la referencia:
   $$S_{\text{KDA}} = 20 \times (1 + \log_2(2.0) \times 0.28) = 20 \times (1 + 1 \times 0.28) = 20 \times 1.280 = 25.60\text{ pts}$$
2. **KP:** $\text{ratio} = \frac{70}{65} \approx 1.0769$. Al superar la referencia:
   $$S_{\text{KP}} = 18 \times (1 + \log_2(1.0769) \times 0.28) = 18 \times (1 + 0.1069 \times 0.28) = 18 \times 1.0298 = 18.54\text{ pts}$$
3. **DPM:** $\text{ratio} = \frac{935}{850} = 1.10$. Al superar la referencia:
   $$S_{\text{DPM}} = 14 \times (1 + \log_2(1.10) \times 0.28) = 14 \times (1 + 0.1375 \times 0.28) = 14 \times 1.0385 = 14.54\text{ pts}$$
4. **DPG:** $\text{ratio} = \frac{1.888,89}{1.850} \approx 1.0210$. Al superar la referencia:
   $$S_{\text{DPG}} = 10 \times (1 + \log_2(1.0210) \times 0.28) = 10 \times (1 + 0.0300 \times 0.28) = 10 \times 1.0084 = 10.08\text{ pts}$$
5. **VSPM:** $\text{ratio} = \frac{0.99}{0.9} = 1.10$. Al superar la referencia:
   $$S_{\text{Vision}} = 10 \times (1 + \log_2(1.10) \times 0.28) = 10 \times (1 + 0.1375 \times 0.28) = 10 \times 1.0385 = 10.39\text{ pts}$$
6. **CSPM:** $\text{ratio} = \frac{9.35}{8.5} = 1.10$. Al superar la referencia:
   $$S_{\text{CS}} = 7 \times (1 + \log_2(1.10) \times 0.28) = 7 \times (1 + 0.1375 \times 0.28) = 7 \times 1.0385 = 7.27\text{ pts}$$
7. **Mitigación:** $\text{ratio} = \frac{405}{450} = 0.90$. Régimen puramente lineal ($\text{ratio} \le 1$):
   $$S_{\text{Mitigation}} = 6 \times \left(\frac{405}{450}\right) = 6 \times 0.90 = 5.40\text{ pts}$$
8. **GPM:** $\text{ratio} = \frac{495}{450} = 1.10$. Al superar la referencia:
   $$S_{\text{GPM}} = 5 \times (1 + \log_2(1.10) \times 0.28) = 5 \times (1 + 0.1375 \times 0.28) = 5 \times 1.0385 = 5.19\text{ pts}$$
9. **WinRate:** Victoria al 100%:
   $$S_{\text{WinRate}} = 10 \times \left(\frac{100}{100}\right) = 10.00\text{ pts}$$

#### Puntuación Final Consolidada y Redondeada
Sumando los 9 componentes calculados:

$$\text{finalScore} = 25.60 + 18.54 + 14.54 + 10.08 + 10.39 + 7.27 + 5.40 + 5.19 + 10.00 = 107.01$$

Aplicando el redondeo final a un decimal (`Math.round(matchMvpScore(rows, all) * 10) / 10`, `player-statistics.ts:195-197`):

$$\text{Puntuación Final} = \frac{\lfloor 107.01 \cdot 10 + 0.5 \rfloor}{10} = 107.0\text{ puntos}$$

> [!NOTE]
> El motor de cálculo no trunca la puntuación a un límite de 100 puntos. La combinación del escalado logarítmico cóncavo y las 9 dimensiones premia el rendimiento sobresaliente (*overperformance*), permitiendo superar la base de 100 puntos en actuaciones extraordinarias (por ejemplo, 108.7 puntos en el caso de Buzel, verificado en `apps/api/src/modules/competition/player-statistics.test.ts`).

### 3.5 Agregación de la serie y datos ausentes

`mapMvpScore` calcula las nueve dimensiones por mapa sin redondear. `matchMvpScore` calcula `sum(scoreMapa * duración) / sum(duración)` sobre los mapas del jugador. `mvpScore` conserva una salida redondeada a un decimal para sus consumidores, pero la selección del ganador usa la precisión completa.

Una duración ausente, no finita o no positiva produce cero en el cálculo individual y se excluye de la media. Un candidato con algún mapa sin duración válida no recibe el galardón. Si falta oro se mantienen los fallbacks a DPM y CS. Las estadísticas generales del perfil siguen usando `aggregatePlayerStats`.

### 3.6 Selección del MVP de serie

`matchMvps` evalúa cada enfrentamiento por separado, con todos sus mapas y participantes:

- Exige haber disputado al menos el 50% de los mapas: 1 de 2, 2 de 3 o 3 de 5. No aplica una penalización adicional por cobertura.
- Cuenta cada mapa una sola vez para determinar el equipo vencedor. Solo sus jugadores pueden optar al MVP; en una serie empatada pueden optar ambos equipos.
- No exige haber ganado ningún MVP de mapa: un jugador regular puede ganar por su rendimiento en el conjunto de la serie.
- Compara score sin redondear, victorias, participación en bajas, KDA sin redondear y daño total a campeones. Solo un empate en todos esos valores se resuelve por identificador para mantener un resultado estable.
- Devuelve el ganador y su score redondeado a un decimal. Sin candidatos válidos no concede MVP.

`sealMatchMvp` y `backfillMatchMvps` cargan las filas mediante `loadMatchMvpRows` (en `match-mvp-data.ts`) e invocan directamente `matchMvps(rows)[0]`, incluyendo oro y posición del replay. El sellado se ejecuta dentro de la transacción ROFL después de insertar y ordenar todos los mapas del lote; el backfill procesa y verifica cada serie en su propia transacción.

El sellado automático al finalizar la subida ROFL y el backfill histórico utilizan este cálculo. Los endpoints consumen sus resultados persistidos, como se describe a continuación.
Esta unificación garantiza que el galardón de MVP sea matemáticamente idéntico tanto si se consulta desde la perspectiva de la serie individual como desde la agregación de jugadores de la división o temporada, resolviendo casos sensibles de desempate dimensional donde el oro acumulado resulta determinante (por ejemplo, el escenario verificado en tests donde Buzel con 108.7 supera a Sm0kY con 107.1).

### 3.7 Consumo de galardones persistidos

Los endpoints no ejecutan `matchMvps` para asignar premios de serie. Esa asignación queda reservada a la finalización por ROFL y al backfill histórico. Solo el desempate del banner reconstruye las métricas de los MVP ya guardados cuando sus notas máximas coinciden.

- Detalle de partido y calendario: leen `matches.mvp_player_id`; los partidos no completados no publican MVP.
- Listado de jugadores de una división: consulta los galardones de los enfrentamientos completados de esa división y los entrega a `enrichPlayers`. Esta función sigue calculando estadísticas generales, pero no decide premios.
- Ficha de jugador: consulta los identificadores de enfrentamientos con `mvp_player_id` igual al jugador dentro de su temporada, independientemente del equipo o división actual. Sin equipo activo, busca la temporada más reciente con partidas o MVPs registrados. Conserva los galardones aunque no haya snapshots de estadísticas disponibles.
- Ficha de equipo: cuenta los MVP persistidos de sus series ganadas para cada integrante de plantilla. Los premios obtenidos con otro equipo no pasan a contabilizarse por un traspaso.

Un `mvp_player_id` vacío sigue vacío: no existe recálculo de respaldo. Antes de desplegar estas lecturas sobre una base existente se debe ejecutar y verificar el [backfill histórico](../../database/mvp-backfill.md).

### 3.8 Banner de jornada

El repositorio selecciona la jornada más reciente de la división que tenga al menos un enfrentamiento completado con jugador y score MVP persistidos. Ordena las jornadas por fecha de inicio descendente (fechas nulas al final) e identificador descendente. Una nueva jornada sin galardones no desplaza la última jornada con MVP disponibles.

Dentro de esa jornada, `featuredMatchMvp` consulta `matches` por división, ronda y estado `completed`, exige ambos campos de MVP y obtiene la nota máxima con `ORDER BY mvp_score DESC NULLS LAST LIMIT 1`. Después consulta todos los enfrentamientos de esa jornada con esa nota. El índice parcial `matches_round_mvp_score_idx` facilita la búsqueda y la ordenación principal.

Si hay varios empatados, carga únicamente sus filas con `loadMatchMvpRows` y obtiene las métricas del MVP persistido de cada serie mediante `playerMvpRanking`. Ordena con `compareMvpRanking`, la misma función que utiliza `matchMvps`: score sin redondear → victorias → participación en bajas → KDA → daño total a campeones, todos descendentes; solo un empate completo se resuelve por `playerId` ascendente mediante `localeCompare`. El UUID del enfrentamiento no decide el banner. Esta comparación no modifica los galardones guardados. Si faltan filas, se aplican los valores que producen las funciones estadísticas sobre los datos disponibles (incluido cero para conjuntos vacíos), sin inventar un MVP de serie.

El banner muestra estadísticas de la jornada seleccionada y su nombre. La puntuación interna no se expone en el contrato público. Sin galardones en ninguna jornada devuelve `featured: null`.

---
## 4. Normalización de Posiciones y Desempate de Campeón Destacado

### 4.1 Normalización de Roles (`player-statistics.ts:25-34`)
Para garantizar consistencia con los datos provenientes de la Riot API o de hojas de cálculo, las posiciones se unifican mediante la función `playerRole`:
- `'middle'` $\to$ `'mid'`
- `'bottom'` o `'bot'` $\to$ `'adc'`
- `'utility'` o `'sup'` $\to$ `'support'`
- `'jg'` o `'jungla'` $\to$ `'jungle'`
- Otras cadenas se convierten a minúsculas o se evalúan como `null`.

### 4.2 Desempate Cronológico de Campeón Destacado (*Splash Art*) (`player-statistics.ts:290-306`)
Para seleccionar el campeón más representativo de un jugador en la temporada, la función pura exportada `mostPlayedChampion(games: PlayerGameRow[])` (`player-statistics.ts:290-306`) procesa el historial de partidas:
- Se contabilizan las partidas disputadas con cada campeón mediante un mapa de frecuencias `Map<string, number>`.
- La evaluación de máximo se realiza mediante la condición `count >= mostGames` (`player-statistics.ts:300`).
- Las consultas `players` y `playerSeasonGames` de `postgres-competition.repository.ts` ordenan el historial antes de entregarlo a `mostPlayedChampion`. En caso de empate en número de mapas, vence el campeón de la última fila recibida; los criterios adicionales de fecha programada e identificadores mantienen un orden estable.

---

## 5. Motor de Estadísticas de Campeones (`champion-stats.ts`)

La función `calculateChampionStats(picks: ChampionPick[])` (`champion-stats.ts:1-32`) agrega las selecciones de campeones en mapas concluidos:

1. **Filtro de Integridad**: Descarta picks donde `winnerTeamId === null` o el nombre del campeón esté vacío (`línea 5`).
2. **Conteo Único de Mapas**: Almacena los identificadores de mapa en un `Set<string>` para determinar el número real de mapas únicos disputados en la división (`totalGames = new Set(valid.map((pick) => pick.gameId)).size`, `línea 6`).
3. **Métricas Computadas**:
   - `games`: Número de mapas en los que el campeón fue elegido (`línea 23`).
   - `wins`: Mapas donde `pick.teamId === pick.winnerTeamId` (`línea 24`).
   - `losses`: `games - wins` (`línea 25`).
   - `pickRate`: `(games / totalGames) * 100` (`línea 27`).
   - `winRate`: `(wins / games) * 100` (`línea 28`).
4. **Ordenación Final**: Mayor número de mapas jugados (`b.games - a.games`) y desempate alfabético por nombre de campeón (`a.champion.localeCompare(b.champion)`, `línea 30`).

---

## 6. Generador Determinista de Slugs (`profile-slugs.ts`)

Para generar URLs semánticas y amigables para el usuario (ej. `/partidos/los-chicos-vs-team-rebel-jornada-1`), el módulo `profile-slugs.ts:1-60` implementa un generador con resolución de colisiones en tres etapas:

1. **Normalización Base (`líneas 3-12`)**:
   - Aplica descomposición Unicode `NFKD`, remueve diacríticos (`\p{M}`), convierte a minúsculas y reemplaza caracteres no alfanuméricos por guiones `-`.
   - Limita la longitud máxima a 160 caracteres y purga guiones iniciales o finales.
2. **Evasión de Patrones UUID (`líneas 21-23`)**:
   - Si la cadena resultante coincide con el formato de un UUID (`/^[0-9a-f]{8}-[0-9a-f]{4}-.../i`), se le antepone el prefijo fallback (ej. `equipo-<uuid>`), impidiendo colisiones entre identificadores sintéticos y UUIDs nativos.
3. **Estrategia Escalada Anti-Colisión (`líneas 31-52`)**:
   - **Paso 1**: Si el slug base colisiona, se concatena el contexto: `${base}-${context}` (ej. `los-chicos-temporada-1-premier`).
   - **Paso 2**: Si la colisión persiste, se calcula un hash criptográfico SHA-256 sobre el ID original y se extraen los primeros 8 caracteres hexadecimales: `${base}-${hashSuffix}`.
   - **Paso 3**: Si ocurre una colisión sobre el hash, se añade un sufijo numérico incremental secuencial (`-2`, `-3`).
4. **Resolución Inversa (`resolveProfileId`, `líneas 55-59`)**:
   - Si la referencia suministrada por el usuario ya es un UUID estándar, se devuelve directamente sin consultar el mapa en memoria. Si es un slug, se resuelve en tiempo $O(1)$ contra el mapa invertido `Map<string, string>`.
5. **Entradas compartidas de equipos y jugadores (`teamProfileSlugs` y `playerProfileSlugs`, `líneas 61-85`)**:
   - Encapsulan la entrada de `profileSlugs` para equipos (nombre, contexto `temporada división`, prefijo `equipo`) y jugadores (`gameName riotTag`, prefijo `jugador`). `CompetitionService` y el [sitemap](../sitemap/processing.md#32-rutas-dinámicas-de-base-de-datos) las usan para que el campo `slug` de la API y las URLs del sitemap coincidan.

---

## 7. Especificación de Visibilidad de Equipos y Sentinels de Roles (`team-visibility.ts`)

La visibilidad y participación de los equipos en la plataforma se gestiona mediante la especificación canónica en `apps/web/src/features/competition/team-visibility.ts:1-16`, vinculando el identificador numérico de rol de Discord (`discordRoleId`, almacenado como `bigint` en PostgreSQL y serializado como `string | null` en la API):

```typescript
// apps/web/src/features/competition/team-visibility.ts:1-16
type TeamRole = { discordRoleId?: string | null };

function hasRoleAtLeast(team: TeamRole | undefined, minimum: bigint): boolean {
  const roleId = team?.discordRoleId;
  return Boolean(roleId && BigInt(roleId) >= minimum);
}

// Zero is active; -10 belongs to withdrawn teams, not ghost teams.
export function isActiveTeam(team: TeamRole | undefined): boolean {
  return hasRoleAtLeast(team, 0n);
}

export function isTeamVisibleInCalendar(team: TeamRole | undefined): boolean {
  return hasRoleAtLeast(team, -10n);
}
```

### 7.1 Función `isActiveTeam(team)`
Requiere `discordRoleId >= 0n`. Un equipo con un rol numérico mayor o igual a cero se considera un equipo activo participante en la competición:
- **Inclusión en Clasificación:** Se contabiliza en la tabla de clasificación (`StandingsTable.tsx:3`).
- **Inclusión en Cuadrícula de Equipos:** Se renderiza en el catálogo de equipos de la división (`TeamGrid.tsx:3`).
- **Inclusión en Predicciones:** Habilita el pronóstico de sus enfrentamientos tanto en el calendario de votación como en la mutación transaccional (`predictions.repository.ts:50-51, 185-188`).

### 7.2 Función `isTeamVisibleInCalendar(team)` y Valores Sentinel
Requiere `discordRoleId >= -10n`. Controla la visibilidad de los partidos en el calendario de la temporada (`MatchList.tsx:3`), distinguiendo los siguientes estados mediante valores centinela numéricos:

- **Sentinel `-10n` (Equipos Retirados / Abandonados - `withdrawn`):**
  - Identifica a aquellos equipos que abandonaron o fueron retirados de la competición tras haber iniciado la temporada.
  - **Comportamiento en Calendario:** Al cumplir `BigInt(roleId) >= -10n`, sus partidos permanecen visibles en el calendario para preservar la trazabilidad histórica de los enfrentamientos disputados previamente o de los puntos adjudicados por incomparecencia (*forfeit*).
  - **Exclusión de Clasificación y Pronósticos:** Al no satisfacer `discordRoleId >= 0n`, quedan excluidos de la clasificación activa y del sistema de predicciones.
- **Sentinel `-9000n` (Equipos Fantasma - `ghost teams`):**
  - Identifica equipos de prueba, comodines técnicos o entidades ficticias (`BigInt(roleId) < -10n`).
  - **Comportamiento Perimetral:** Quedan completamente excluidos e invisibles tanto en el calendario como en la clasificación y las predicciones.
- **Equipos sin Rol (`discordRoleId === null` o `undefined`):**
  - Equipos sin rol de Discord configurado. Se tratan como inactivos y no superan los filtros de visibilidad activa ni de calendario.
