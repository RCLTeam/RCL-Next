# Componentes de Presentación (Dumb UI): Match Predictions

[⬅️ Volver a Web Predictions](README.md) | [Siguiente: Hooks ➡️](hooks.md)

---

## 1. Visión General y Aislamiento de Red

Los componentes visuales del módulo de predicciones residen en `apps/web/src/site/pages/predictions/`. Operan como **Dumb Components** puros bajo el Golden Standard del monorepo:
- **Cero Red:** Contienen estrictamente **0 llamadas a `fetch` y 0 llamadas a `WebSocket`**.
- **Control Unidireccional:** Reciben datos estructurados (`match`, `summary`, `pick`, `ranking`) y delegan la persistencia a la función asíncrona `save(pick)` inyectada por la Smart Page.
- **Accesibilidad Estricta:** Incorporan atributos ARIA (`aria-pressed`, `aria-hidden`, `aria-labelledby`, `aria-label`) para garantizar navegación completa por lectores de pantalla y teclado.

---

## 2. Catálogo de Componentes Visuales

### 2.1 `PredictionCard.tsx` (`apps/web/src/site/pages/predictions/PredictionCard.tsx:5-151`)
Tarjeta visual para pronosticar el resultado de una serie deportiva.

#### Props:
```typescript
interface PredictionCardProps {
  match: Match;
  summary: PredictionSummary;
  pick?: PredictionPick | undefined;
  authenticated: boolean;
  save: (pick: PredictionPick) => Promise<void>;
}
```

#### Mecanismos y Comportamiento:
1. **Termómetro Comunitario Condicional:**
   - **Ventana Cerrada con Votos (`summary.closed && summary.votes !== null && summary.homePercent !== null`):** Renderiza el termómetro visual con la barra de progreso `.prediction-gauge` cuyo ancho refleja `style={{ width: `${summary.homePercent}%` }}`, los porcentajes calculados para local y visitante (`summary.homePercent%` vs `100 - summary.homePercent%`) y el recuento de participación:
     ```tsx
     <small>{summary.votes} votos de la comunidad</small>
     ```
   - **Ventana Cerrada sin Votos (`summary.closed && summary.votes !== null && summary.homePercent === null`):** Muestra `<p className="prediction-notice">Sin votos para esta serie.</p>`.
   - **Ventana Cerrada con Datos Ocultos (`summary.closed && summary.votes === null`):** Renderiza una barra `.prediction-gauge` con ancho fijo `50%` y dos etiquetas `??` dentro de `.prediction-percent`, con `aria-label="Porcentajes pendientes de revelar"`. Este placeholder neutral no representa votos reales. Debajo mantiene `<small>Los porcentajes se revelan al finalizar el partido.</small>`.
   - **Ventana No Cerrada (`!summary.closed`):** No renderiza la barra y muestra el aviso:
     ```tsx
     <p className="prediction-notice">Los porcentajes se revelan al finalizar el partido.</p>
     ```
2. **Formulario Interactivo de Pronóstico (Líneas 63-149):**
   - Se renderiza únicamente si la votación está abierta y el usuario ha iniciado sesión (`summary.open && authenticated`).
   - **Botones de Ganador:** Dos botones con emblemas de equipo (`TeamBadge`) que utilizan `aria-pressed={team === match.homeTeam?.id}` para indicar la selección activa.
   - **Desplegable de Tanteo Dinámico:** Se calculan las victorias requeridas en función del formato de la serie (`wins = Math.floor(match.bestOf / 2) + 1`). Las opciones se computan automáticamente en función del equipo elegido:
     ```typescript
     const options = Array.from({ length: wins }, (_, loser) =>
       home ? `${wins}:${loser}` : `${loser}:${wins}`
     );
     ```
   - **Envío y Guardado:** Al enviar el formulario, el componente activa el estado local `saving`, divide el tanteo y ejecuta `await save(...)`, notificando al usuario mediante mensajes accesibles.

---

### 2.2 `PredictionRules.tsx` (`apps/web/src/site/pages/predictions/PredictionRules.tsx:4-29`)
Componente presentacional estático que expone las tres reglas oficiales de las quinielas de la liga mediante tarjetas informativas accesibles:

1. **Acierto de Ganador:** *"1 punto por cada serie cuyo vencedor coincida con tu pronóstico."*
2. **Marcador Exacto:** *"3 puntos en total si además aciertas el resultado exacto de la serie."*
3. **Plazo Límite de Votación:** *"Vota desde el lunes a las 00:00 hasta 1 hora antes del inicio de cada partido."*

---

### 2.3 `PredictorRankingPanel.tsx` (`apps/web/src/site/pages/predictions/PredictorRankingPanel.tsx:4-64`)
Panel que renderiza la tabla de clasificación de pronosticadores de la temporada.

#### Props:
```typescript
interface PredictorRankingPanelProps {
  ranking: PredictorStanding[];
  season?: string | undefined;
  userId?: string | undefined;
}
```

#### Características de Accesibilidad y Representación:
1. **Fila Personal Destacada (`.is-you`):**
   ```typescript
   const own = ranking.find((row) => row.userId === userId);
   const rows = ranking.slice(0, 5);
   if (own && !rows.includes(own)) rows.push(own);
   ```
   El componente extrae las 5 mejores posiciones de la temporada. Si el usuario autenticado (`userId`) está clasificado fuera del Top 5, añade su fila como sexta entrada. Su fila lleva la clase CSS `.is-you` tanto dentro como fuera del Top 5. El nombre se muestra sin prefijo:
   ```tsx
   <strong>{displayName(row.name)}</strong>
   ```
2. **Tabla Placeholder para Temporadas sin Resultados (Líneas 42-60):**
   Si la temporada aún no ha disputado enfrentamientos puntuables (`ranking.length === 0`), renderiza una tabla accesible (`<table aria-label="Ranking pendiente de resultados">`) con 5 filas vacías rotuladas con `"Por clasificar"`, evitando colapsos visuales de diseño.
3. **Avatar de Discord:** `PredictorAvatar` utiliza `discordAvatarUrl(row.userId, row.avatarHash)` para cargar la imagen desde `/api/v1/discord-avatars/:discordId/:hash`, con ambos segmentos codificados. El proxy elige PNG o GIF para los hashes con prefijo `a_`; el navegador no consulta directamente el CDN. La imagen decorativa mide 40 × 40 y usa `loading="lazy"`. Si `avatarHash` es `null` o se dispara `onError`, muestra los dos primeros caracteres de `displayName(row.name)` en mayúsculas. La clave del componente combina usuario y hash para reiniciar el estado de error cuando cambia el avatar. Véase el [contrato del proxy](../../api/auth/avatars.md).
