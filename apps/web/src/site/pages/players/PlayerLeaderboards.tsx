import React from 'react';

const leaderboards = ['KDA', 'Oro por minuto', 'Daño por minuto', 'Vision'] as const;

export function PlayerLeaderboards() {
  return (
    <div className="leaderboard-grid">
      {leaderboards.map((stat) => (
        <article className="leaderboard-card" key={stat}>
          <h3>{stat}</h3>
          <strong>—</strong>
          <p>Estadisticas pendientes</p>
        </article>
      ))}
    </div>
  );
}
