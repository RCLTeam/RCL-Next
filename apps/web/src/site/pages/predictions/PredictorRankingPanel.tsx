import type { PredictorStanding } from '@rcl/contracts';
import React from 'react';
export function PredictorRankingPanel({
  ranking,
  season,
  userId
}: { ranking: PredictorStanding[]; season?: string | undefined; userId?: string | undefined }) {
  const own = ranking.find((row) => row.userId === userId);
  const rows = ranking.slice(0, 5);
  if (own && !rows.includes(own)) rows.push(own);
  return (
    <section className="predictor-ranking" aria-labelledby="predictor-ranking">
      <h2 id="predictor-ranking" className="eyebrow">
        Ranking de predictores{season ? ` · ${season}` : ''}
      </h2>
      {rows.length ? (
        <ol className="predictor-rows">
          {rows.map((row) => (
            <li
              key={row.userId}
              className={`predictor-row${row.userId === userId ? ' is-you' : ''}`}
            >
              <span className="predictor-position">{row.position}</span>
              <div>
                <strong>
                  {row.userId === userId ? 'tú, ' : ''}
                  {row.name}
                </strong>
                <small>
                  {row.correct} de {row.total} aciertos
                </small>
              </div>
              <span className="predictor-points">
                {row.points} <small>pts</small>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="section-intro">
          Todavía no hay predicciones resueltas esta temporada. Los primeros resultados estrenarán
          el ranking.
        </p>
      )}
    </section>
  );
}
