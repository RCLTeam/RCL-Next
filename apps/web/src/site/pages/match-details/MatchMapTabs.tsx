import type { MatchDetail, MatchMap } from '@rcl/contracts';
import React from 'react';

export function MatchMapTabs({
  match,
  game,
  onSelect
}: { match: MatchDetail; game: MatchMap | undefined; onSelect: (id: string) => void }) {
  const winner =
    game?.winnerTeamId === match.homeTeam.id
      ? match.homeTeam.name
      : game?.winnerTeamId === match.awayTeam.id
        ? match.awayTeam.name
        : null;
  return (
    <>
      {match.games.length > 0 && (
        <div className="match-map-picker" aria-label="Seleccionar mapa">
          {match.games.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={game?.id === item.id}
              onClick={() => onSelect(item.id)}
            >
              Mapa {item.gameNumber}
            </button>
          ))}
        </div>
      )}
      {game && (
        <p className="match-map-result">
          Mapa {game.gameNumber} · {winner ? `Victoria de ${winner}` : 'Ganador no registrado'} ·{' '}
          {game.durationSeconds
            ? `${Math.floor(game.durationSeconds / 60)}:${String(game.durationSeconds % 60).padStart(2, '0')}`
            : 'Duración no disponible'}
        </p>
      )}
    </>
  );
}
