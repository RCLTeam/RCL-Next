import React from 'react';

const leaderboards = ['KDA', 'Oro por minuto', 'Daño por minuto', 'Visión'] as const;

export function PlayerLeaderboards() {
  return (
    <div className="leaderboard-grid">
      {leaderboards.map((stat) => (
        <article className="leaderboard-card" key={stat}>
          <h3>{stat}</h3>
          <strong>—</strong>
          <p>Estadísticas pendientes</p>
        </article>
      ))}
    </div>
  );
}
