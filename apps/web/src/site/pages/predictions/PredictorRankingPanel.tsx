import type { PredictorStanding } from '@rcl/contracts';
import React, { useState } from 'react';
import { discordAvatarUrl } from '../../../shared/discord-avatar-url.js';
import { displayName } from '../../../shared/display-name.js';
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
              <PredictorAvatar key={`${row.userId}-${row.avatarHash}`} row={row} />
              <div>
                <strong>
                  {displayName(row.name)}
                  {row.userId === userId && <span className="sr-only"> (tú)</span>}
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
        <>
          <table className="predictor-placeholder" aria-label="Ranking pendiente de resultados">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Predictor</th>
                <th scope="col">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((position) => (
                <tr key={position}>
                  <td className="predictor-position">{position}</td>
                  <td>Por clasificar</td>
                  <td>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function PredictorAvatar({ row }: { row: PredictorStanding }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="predictor-avatar" aria-hidden="true">
      {row.avatarHash && !failed ? (
        <img
          src={discordAvatarUrl(row.userId, row.avatarHash)}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        displayName(row.name).slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
