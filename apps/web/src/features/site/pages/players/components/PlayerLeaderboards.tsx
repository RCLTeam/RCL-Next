import React from 'react';

export function PlayerLeaderboards() {
  return (
    <div className="leaderboard-grid">
      {['KDA', 'Oro por minuto', 'Daño por minuto', 'Visión'].map((stat) => (
        <article className="leaderboard-card" key={stat}>
          <h3>{stat}</h3>
          <strong>—</strong>
          <p>Estadísticas pendientes</p>
        </article>
      ))}
    </div>
  );
}
