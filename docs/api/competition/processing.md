# Lógica de Procesamiento y Algoritmos del Dominio

[⬅️ Volver a Rutas](routes.md) | [Siguiente: Persistencia ➡️](persistence.md)

---

## 1. Visión General

El archivo `apps/api/src/modules/competition/` concentra la lógica algorítmica y matemática de las competiciones de League of Legends en RCL-Next. Sus responsabilidades se dividen en cinco motores y especificaciones independientes y puras:
1. **Motor de Clasificación y Desempates de Liga (`competition.service.ts:8-50`)**: Cómputo de la tabla de posiciones en series al mejor de 3 (BO3).
2. **Motor de Puntuación Multidimensional de MVP (`player-statistics.ts:81-191`)**: Evaluación del rendimiento individual continuo por rol y selección del mejor jugador.
3. **Motor de Estadísticas Agregadas de Campeones (`champion-stats.ts:1-32`)**: Consolidación de selecciones, mapas disputados, victorias y porcentajes de presencia.
4. **Generador Determinista de Slugs y Evasión de Colisiones (`profile-slugs.ts:1-60`)**: Normalización semántica de URLs para partidos, equipos y jugadores.
5. **Especificación de Visibilidad de Equipos y Sentinels de Roles (`team-visibility.ts:1-16`)**: Determinación del estado de los equipos mediante rangos numéricos de roles de Discord para su inclusión en clasificación, cuadrícula, calendario y pronósticos.

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
        b.wins - a.wins ||
        b.mapDifference - a.mapDifference ||
        a.losses - b.losses ||
        a.team.name.localeCompare(b.team.name, 'es')
    )
    .map((row, index) => ({ position: index + 1, ...row }));
}
```

### 2.2 Cascada Estricta de 4 Niveles de Ordenación
El orden de los equipos en la tabla de clasificación responde a la siguiente evaluación jerárquica (`competition.service.ts:43-48`):

1. **Nivel 1 — Victorias de Serie (`b.wins - a.wins`):**
   - Número total de series completas ganadas.
2. **Nivel 2 — Diferencia Neta de Mapas (`b.mapDifference - a.mapDifference`):**
   - Calculada como `mapsWon - mapsLost`. En un formato BO3, un resultado de 2-0 aporta `+2`, mientras que un 2-1 aporta `+1`.
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

### 3.1 Tablas de Referencia por Rol (`ROLE_REFERENCES` y `DEFAULT_REF`)
Las métricas individuales de cada jugador se evalúan frente a valores estándar de referencia calibrados específicamente para su rol táctico (`player-statistics.ts:90-105`). Si la posición del jugador no está definida o no coincide con los roles estándar, se aplican automáticamente los valores de corte de `DEFAULT_REF`:

| Posición | CSPM (Súbditos/min) | DPM (Daño/min) | GPM (Oro/min) | VSPM (Visión/min) | Mitigación/min | DPG (Daño por 1.000 de Oro) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **`top`** | 7.5 | 650 | 380 | 1.0 | 1100 | 1600 |
| **`jungle`** | 5.8 | 500 | 360 | 1.5 | 950 | 1350 |
| **`mid`** | 8.0 | 750 | 420 | 1.1 | 650 | 1750 |
| **`adc`** | 8.5 | 850 | 450 | 0.9 | 450 | 1850 |
| **`support`** | 1.2 | 250 | 260 | 2.3 | 650 | 900 |
| **`DEFAULT`** | 6.5 | 600 | 370 | 1.2 | 750 | 1500 |

### 3.2 Función de Escalado Continuo Logarítmico (`dynamicScale`)
Para evitar la inflación artificial producida por partidas atípicamente prolongadas o con intercambios desproporcionados de daño, los ratios relativos se atenúan mediante una curva continua cóncava logarítmica en base 2 (`player-statistics.ts:108-112`).

La función matemática a trozos formaliza el comportamiento del escalado continuo:

$$\text{scale}(v, r) = \begin{cases} 0 & \text{si } v \le 0 \\ \frac{v}{r} & \text{si } 0 < v \le r \\ 1 + 0.28 \cdot \log_2\left(\frac{v}{r}\right) & \text{si } v > r \end{cases}$$

Implementación técnica en TypeScript:

```typescript
// apps/api/src/modules/competition/player-statistics.ts:108-112
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
El motor consolida 9 dimensiones evaluadas de forma independiente (`player-statistics.ts:140-159`), con pesos asignados de acuerdo con su impacto en la victoria:

- **KDA ($S_{\text{KDA}}$):** Ponderación base 20 con referencia fija de 4.5:
  $$S_{\text{KDA}} = 20 \cdot \text{scale}(\text{kda}, 4.5)$$
  *(Cita: `player-statistics.ts:140, 150`)*
- **Participación en Asesinatos ($S_{\text{KP}}$):** Ponderación base 18 con referencia fija de 65%:
  $$S_{\text{KP}} = 18 \cdot \text{scale}(\text{KP}, 65)$$
  *(Cita: `player-statistics.ts:141, 151`)*
- **Daño por Minuto ($S_{\text{DPM}}$):** Ponderación base 14 ajustada a la referencia del rol ($R_{\text{dpm}}$):
  $$S_{\text{DPM}} = 14 \cdot \text{scale}(\text{DPM}, R_{\text{dpm}})$$
  *(Cita: `player-statistics.ts:142, 152`)*
- **Eficiencia Económica de Daño ($S_{\text{DPG}}$):** Ponderación base 10 con fallback a la escala de DPM si no se dispone de registro de oro:
  $$S_{\text{DPG}} = \begin{cases} 10 \cdot \text{scale}(\text{DPG}, R_{\text{dpg}}) & \text{si } \text{Gold}_{\text{total}} > 0 \\ 10 \cdot \text{scale}(\text{DPM}, R_{\text{dpm}}) & \text{si } \text{Gold}_{\text{total}} \le 0 \end{cases}$$
  *(Cita: `player-statistics.ts:143, 153`)*
- **Puntuación de Visión por Minuto ($S_{\text{Vision}}$):** Ponderación base 10 ajustada a la referencia del rol ($R_{\text{vspm}}$):
  $$S_{\text{Vision}} = 10 \cdot \text{scale}(\text{VSPM}, R_{\text{vspm}})$$
  *(Cita: `player-statistics.ts:144, 154`)*
- **Súbditos por Minuto ($S_{\text{CS}}$):** Ponderación base 7 ajustada a la referencia del rol ($R_{\text{cspm}}$):
  $$S_{\text{CS}} = 7 \cdot \text{scale}(\text{CSPM}, R_{\text{cspm}})$$
  *(Cita: `player-statistics.ts:145, 155`)*
- **Daño Mitigado por Minuto ($S_{\text{Mitigation}}$):** Ponderación base 6 ajustada a la referencia del rol ($R_{\text{mitigationPm}}$):
  $$S_{\text{Mitigation}} = 6 \cdot \text{scale}(\text{Mitigation}_{\text{pm}}, R_{\text{mitigationPm}})$$
  *(Cita: `player-statistics.ts:146, 156`)*
- **Oro por Minuto ($S_{\text{GPM}}$):** Ponderación base 5 con fallback a la escala de CSPM si no se dispone de registro de oro:
  $$S_{\text{GPM}} = \begin{cases} 5 \cdot \text{scale}(\text{GPM}, R_{\text{gpm}}) & \text{si } \text{Gold}_{\text{total}} > 0 \\ 5 \cdot \text{scale}(\text{CSPM}, R_{\text{cspm}}) & \text{si } \text{Gold}_{\text{total}} \le 0 \end{cases}$$
  *(Cita: `player-statistics.ts:147, 157`)*
- **Tasa de Victorias ($S_{\text{WinRate}}$):** Aporte lineal directo ponderado sobre 10 puntos:
  $$S_{\text{WinRate}} = 10 \cdot \left(\frac{\text{WinRate}}{100}\right)$$
  *(Cita: `player-statistics.ts:158`)*

#### Expresión de Consolidación Acumulada
La puntuación bruta acumulada suma directamente las 9 dimensiones:

$$\text{Score}_{\text{MVP}} = S_{\text{KDA}} + S_{\text{KP}} + S_{\text{DPM}} + S_{\text{DPG}} + S_{\text{Vision}} + S_{\text{CS}} + S_{\text{Mitigation}} + S_{\text{GPM}} + S_{\text{WinRate}}$$

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

Aplicando el redondeo final a un decimal (`Math.round(finalScore * 10) / 10`, `player-statistics.ts:171`):

$$\text{Puntuación Final} = \frac{\lfloor 107.01 \cdot 10 + 0.5 \rfloor}{10} = 107.0\text{ puntos}$$

> [!NOTE]
> El motor de cálculo no trunca la puntuación a un límite de 100 puntos. La combinación del escalado logarítmico cóncavo y las 9 dimensiones premia el rendimiento sobresaliente (*overperformance*), permitiendo superar la base de 100 puntos en actuaciones extraordinarias (por ejemplo, 110.8 puntos como se verifica en `apps/api/src/modules/competition/player-statistics.test.ts:137`).

### 3.5 Anotaciones Técnicas, Casos de Borde y Degradación Agraciada
- **Filtrado Estricto de Duración (`timed`):** Solo las filas de partida con `durationSeconds > 0` entran en el cómputo de tiempo (`player-statistics.ts:122-123`). Si la suma acumulada de minutos de las partidas temporizadas es cero (`minutes === 0`), el algoritmo aborta la ejecución de forma segura y devuelve `0` (`player-statistics.ts:125`).
- **Ámbito Diferenciado de Agregación:**
  - `totalDamage` y `totalGold` se reducen directamente sobre la totalidad del array `rows` (`player-statistics.ts:128-129`), garantizando que cualquier registro con daño u oro computado aporte a los totales acumulados.
  - En contraste, `vspm` y `mitigationPm` se calculan exclusivamente sobre el subconjunto `timed` dividido entre `minutes` (`player-statistics.ts:135-137`).
- **Mecanismos de Fallback Económico (Degradación Agraciada):** Cuando una partida no registra datos válidos de oro (`totalGold <= 0`):
  - `dpgScore` asume automáticamente el valor escalar de `dpmScore` (`player-statistics.ts:143`), conservando el peso específico de 10 puntos de la dimensión ($10 \cdot \text{scale}(\text{DPM}, R_{\text{dpm}})$ en `player-statistics.ts:153`).
  - `gpmScore` asume automáticamente el valor escalar de `csScore` (`player-statistics.ts:147`), conservando el peso específico de 5 puntos de la dimensión ($5 \cdot \text{scale}(\text{CSPM}, R_{\text{cspm}})$ en `player-statistics.ts:157`).
  Esto evita divisiones por cero o propagación de valores `NaN` / `null` en partidas disputadas antes de incorporar métricas económicas completas, preservando la coherencia en las ponderaciones de la matriz dimensional.
- **Redondeo Final Determinista:** Tras acumular las 9 dimensiones ponderadas, la puntuación se redondea a un único decimal con precisión determinista mediante `Math.round(finalScore * 10) / 10` (`player-statistics.ts:171`).

### 3.6 Selección del MVP de Serie y Criterios de Desempate (`player-statistics.ts:174-191`)
Para seleccionar el MVP definitivo de un enfrentamiento o serie (`matchMvps`), se agrupan los registros de todos los mapas por `matchId` y por jugador individual (`playerId`), evaluando a todos los candidatos mediante una cascada determinista de tres niveles (`player-statistics.ts:186-189`):

1. **Nivel 1 — Mayor Puntuación Acumulada (`b.score - a.score`):** Prioriza al jugador con la puntuación MVP más alta en la serie.
2. **Nivel 2 — Mayor Cantidad de Mapas Ganados (`b.wins - a.wins`):** En caso de empate en puntuación, prioriza al candidato que haya obtenido más victorias de mapa dentro de la serie.
3. **Nivel 3 — Desempate Determinista Alfanumérico (`a.playerId.localeCompare(b.playerId)`):** Si persiste el empate en puntuación y victorias, se desempata por orden lexicográfico ascendente del identificador de jugador (`playerId`), garantizando un resultado determinista sin aleatoriedad.

El candidato posicionado en primer lugar tras la ordenación (`candidates.slice(0, 1)`) se designa formalmente como MVP de la serie (`mvpPlayerId`, referenciado por `competition.service.ts:133`).

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
- Dado que las partidas se consultan ordenadas cronológicamente por `asc(matches.finishedAt)` (`postgres-competition.repository.ts:223`), en caso de empate en número de partidas, el campeón utilizado más recientemente sobrescribe la selección, garantizando un resultado determinista sin aleatoriedad.

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
- **Inclusión en Predicciones:** Habilita el pronóstico de sus enfrentamientos tanto en el calendario de votación como en la mutación transaccional (`predictions.repository.ts:29-30, 130`).

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
