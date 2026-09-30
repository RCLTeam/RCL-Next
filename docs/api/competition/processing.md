# Lógica de Procesamiento y Algoritmos del Dominio

[⬅️ Volver a Rutas](routes.md) | [Siguiente: Persistencia ➡️](persistence.md)

---

## 1. Visión General

El archivo `apps/api/src/modules/competition/` concentra la lógica algorítmica y matemática de las competiciones de League of Legends en RCL-Next. Sus responsabilidades se dividen en cuatro motores independientes y puros:
1. **Motor de Clasificación y Desempates de Liga (`competition.service.ts:8-50`)**: Cómputo de la tabla de posiciones en series al mejor de 3 (BO3).
2. **Motor de Puntuación Multidimensional de MVP (`player-statistics.ts:81-191`)**: Evaluación del rendimiento individual continuo por rol y selección del mejor jugador.
3. **Motor de Estadísticas Agregadas de Campeones (`champion-stats.ts:1-32`)**: Consolidación de selecciones, mapas disputados, victorias y porcentajes de presencia.
4. **Generador Determinista de Slugs y Evasión de Colisiones (`profile-slugs.ts:1-60`)**: Normalización semántica de URLs para partidos, equipos y jugadores.

---

## 2. Motor de Clasificación de Liga y Reglas de Desempate

### 2.1 Algoritmo de Acumulación (`calculateStandings`)
La función pura `calculateStandings(teams, matches)` (`competition.service.ts:8-50`) procesa los resultados de los partidos disputados en la fase indicada (por defecto `'regular'`):

```typescript
// apps/api/src/modules/competition/competition.service.ts:8-50
export function calculateStandings(teams: Team[], matches: Match[]) {
  const totals = new Map(
    teams.map((team) => [
      team.id,
      { team, played: 0, wins: 0, losses: 0, mapsWon: 0, mapsLost: 0, mapDifference: 0 }
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
  return [...totals.values()]
    .sort(
      (a, b) =>
        b.mapDifference - a.mapDifference ||
        b.wins - a.wins ||
        a.losses - b.losses ||
        a.team.name.localeCompare(b.team.name, 'es')
    )
    .map((row, index) => ({ position: index + 1, ...row }));
}
```

### 2.2 Cascada Estricta de 4 Niveles de Ordenación
El orden de los equipos en la tabla de clasificación responde a la siguiente evaluación jerárquica (`competition.service.ts:43-48`):

1. **Nivel 1 — Diferencia Neta de Mapas (`b.mapDifference - a.mapDifference`):**
   - Calculada como `mapsWon - mapsLost`. En un formato BO3, un resultado de 2-0 aporta `+2`, mientras que un 2-1 aporta `+1`.
2. **Nivel 2 — Victorias de Serie (`b.wins - a.wins`):**
   - Número total de series completas ganadas.
3. **Nivel 3 — Menor Número de Derrotas (`a.losses - b.losses`):**
   - Número total de series perdidas (prioriza al equipo con menos derrotas).
4. **Nivel 4 — Desempate Determinista Alfabético (`a.team.name.localeCompare(b.team.name, 'es')`):**
   - Ordenación lexicográfica por nombre de equipo bajo el locale español (`'es'`).

### 2.3 Reglas de Desempate y Ausencia de Head-to-Head
- **Ausencia de Enfrentamiento Directo:** El sistema **no implementa desempate por enfrentamiento directo (*Head-to-Head*)**. Si dos equipos empatan en diferencia de mapas, victorias y derrotas, su posición relativa no se decide por el resultado del partido entre ellos, sino por el orden alfabético de sus nombres (`competition.service.ts:48`).
- **Ausencia de Mini-liga:** El sistema **no implementa desempate por mini-liga olímpica** para empates triples o cuádruples.
- **Ausencia de Rachas:** El sistema **no realiza seguimiento ni expone rachas de victorias/derrotas (*streaks*)**. El tipo de contrato `Standing` carece de dicho atributo.

---

## 3. Algoritmo Multidimensional de Puntuación MVP

El motor de rendimiento individual (`apps/api/src/modules/competition/player-statistics.ts:81-191`) calcula la puntuación global de cada jugador por cada serie completada.

### 3.1 Tablas de Referencia por Rol (`player-statistics.ts:90-105`)
Las métricas se comparan contra valores estándar de referencia según la posición del jugador:

| Posición | CSPM (Súbditos/min) | DPM (Daño/min) | GPM (Oro/min) | VSPM (Visión/min) | Mitigación/min | DPG (Daño por Oro) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **`top`** | 7.5 | 650 | 380 | 1.0 | 1100 | 1600 |
| **`jungle`** | 5.8 | 500 | 360 | 1.5 | 950 | 1350 |
| **`mid`** | 8.0 | 750 | 420 | 1.1 | 650 | 1750 |
| **`adc`** | 8.5 | 850 | 450 | 0.9 | 450 | 1850 |
| **`support`**| 1.2 | 250 | 260 | 2.3 | 650 | 900 |
| **`DEFAULT`**| 6.5 | 600 | 370 | 1.2 | 750 | 1500 |

### 3.2 Función de Escalado Continuo Logarítmico
Para evitar la inflación artificial producida por partidas atípicamente prolongadas o con intercambios desproporcionados de daño, los ratios se atenúan mediante una curva logarítmica base 2 (`player-statistics.ts:108-112`):

```typescript
function dynamicScale(value: number | null, reference: number): number {
  if (!value || value <= 0 || reference <= 0) return 0;
  const ratio = value / reference;
  return ratio <= 1 ? ratio : 1 + Math.log2(ratio) * 0.28;
}
```

*Propiedades matemáticas*:
- Si $\text{valor} \le \text{referencia}$, la escala es estrictamente lineal: $f(\text{ratio}) = \text{ratio}$.
- Si $\text{valor} > \text{referencia}$, el exceso se comprime logarítmicamente: $f(\text{ratio}) = 1 + \log_2(\text{ratio}) \times 0.28$.

### 3.3 Matriz Ponderada de 9 Dimensiones (`player-statistics.ts:150-171`)
La puntuación consolidada pondera 9 métricas independientes:

$$\begin{aligned}
\text{Score}_{\text{MVP}} = & \; 20 \times S_{\text{kda}} \\
& + 18 \times S_{\text{kp}} \\
& + 14 \times S_{\text{dpm}} \\
& + 10 \times S_{\text{dpg}} \\
& + 10 \times S_{\text{vision}} \\
& + 7 \times S_{\text{cs}} \\
& + 6 \times S_{\text{mitigation}} \\
& + 5 \times S_{\text{gpm}} \\
& + 10 \times \left(\frac{\text{winRate}}{100}\right)
\end{aligned}$$

Donde:
- $S_{\text{kda}} = \min(\text{kda} / 4.0, 1.75)$ (`player-statistics.ts:133`).
- $S_{\text{kp}} = \text{killParticipation} / 65.0$ (`player-statistics.ts:136`).
- $S_{\text{dpm}} = \text{dynamicScale}(\text{damagePerMinute}, \text{ref.dpm})$.
- $S_{\text{dpg}} = \text{dynamicScale}(\text{damagePerGold}, \text{ref.dpg})$.
- $S_{\text{vision}} = \text{dynamicScale}(\text{visionScorePerMinute}, \text{ref.vspm})$.
- $S_{\text{cs}} = \text{dynamicScale}(\text{csPerMinute}, \text{ref.cspm})$.
- $S_{\text{mitigation}} = \text{dynamicScale}(\text{damageMitigatedPerMinute}, \text{ref.mitigationPerMinute})$.
- $S_{\text{gpm}} = \text{dynamicScale}(\text{goldPerMinute}, \text{ref.gpm})$.

#### Tolerancia a Fallos y Degradación Agraciada
Si el registro del partido carece de datos de oro acumulado (`goldEarned === null`):
- $S_{\text{dpg}}$ degrada automáticamente a $S_{\text{dpm}}$ (`player-statistics.ts:143`).
- $S_{\text{gpm}}$ degrada automáticamente a $S_{\text{cs}}$ (`player-statistics.ts:148`).
Esto previene valores `NaN` en enfrentamientos con datos incompletos.

### 3.4 Selección del MVP de Serie y Desempates (`player-statistics.ts:174-191`)
Se agregan las estadísticas de todos los mapas del enfrentamiento. Los candidatos se ordenan por:
1. Mayor puntuación acumulada (`b.score - a.score`).
2. Mayor cantidad de mapas ganados en la serie (`b.wins - a.wins`).
3. Desempate determinista por ID de jugador (`a.playerId.localeCompare(b.playerId)`).

El primer jugador resultante se designa como MVP (`mvpPlayerId`, `competition.service.ts:101`).

---

## 4. Normalización de Posiciones y Desempate de Campeón Destacado

### 4.1 Normalización de Roles (`player-statistics.ts:25-32`)
Para garantizar consistencia con los datos provenientes de la Riot API o de hojas de cálculo, las posiciones se unifican mediante la función `normalizePosition`:
- `'middle'` $\to$ `'mid'`
- `'bottom'` o `'bot'` $\to$ `'adc'`
- `'utility'` o `'sup'` $\to$ `'support'`
- `'jg'` o `'jungla'` $\to$ `'jungle'`
- Otras cadenas se convierten a minúsculas o se evalúan como `null`.

### 4.2 Desempate Cronológico de Campeón Destacado (*Splash Art*)
Para seleccionar el campeón más representativo de un jugador en la temporada (`player-statistics.ts:255-268`):
- Se contabilizan las partidas disputadas con cada campeón.
- La evaluación se realiza mediante `count >= mostGames`.
- Dado que las partidas se consultan ordenadas cronológicamente por `asc(matches.finishedAt)` (`postgres-competition.repository.ts:211`), en caso de empate en número de partidas, el campeón utilizado más recientemente sobrescribe la selección, garantizando un resultado determinista sin aleatoriedad.

---

## 5. Motor de Estadísticas de Campeones (`champion-stats.ts`)

La función `calculateChampionStats(picks: ChampionPick[])` (`champion-stats.ts:1-32`) agrega las selecciones de campeones en mapas concluidos:

1. **Filtro de Integridad**: Descarta picks donde `winnerTeamId === null` o el nombre del campeón esté vacío (`líneas 8-10`).
2. **Conteo Único de Mapas**: Almacena los identificadores de mapa en un `Set<string>` para determinar el número real de mapas únicos disputados en la división (`totalGames = uniqueGames.size`, `líneas 11-19`).
3. **Métricas Computadas**:
   - `games`: Número de mapas en los que el campeón fue elegido.
   - `wins`: Mapas donde `pick.teamId === pick.winnerTeamId`.
   - `losses`: `games - wins`.
   - `pickRate`: `(games / totalGames) * 100` (`línea 26`).
   - `winRate`: `(wins / games) * 100` (`línea 27`).
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
