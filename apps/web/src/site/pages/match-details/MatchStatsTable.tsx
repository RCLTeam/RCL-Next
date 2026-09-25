import type { MatchDetail, MatchMap, MatchParticipant } from '@rcl/contracts';
import React, { useState } from 'react';
import { Select } from '../../../shared/components/Selector/Selector.js';
import { formatMatchStat, matchPosition, positionRows, statGroups } from './match-stats.js';

export function MatchStatsTable({ game, match }: { game: MatchMap; match: MatchDetail }) {
  const selectId = React.useId();
  const [choice, setChoice] = useState('');
  const ordered = positionRows(game.participants, match.homeTeam.id, match.awayTeam.id)
    .flatMap((row) => [row.home, row.away])
    .filter((player): player is MatchParticipant => !!player);
  const player = ordered.find((item) => item.id === choice) ?? ordered[0];
  if (!player) return <div className="empty-state">Estadísticas pendientes de importar.</div>;
  const team = player.teamId === match.homeTeam.id ? match.homeTeam : match.awayTeam;
  const stats = player.stats;
  const minutes = game.durationSeconds ? game.durationSeconds / 60 : null;
  return (
    <>
      <label htmlFor={`${selectId}-1`} className="select-field match-player-select">
        Seleccionar jugador
        <Select
          id={`${selectId}-1`}
          value={player.id}
          onChange={(event) => setChoice(event.target.value)}
        >
          {ordered.map((item) => (
            <option key={item.id} value={item.id}>
              {item.gameName} ·{' '}
              {item.teamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name} ·{' '}
              {matchPosition(item.position)}
            </option>
          ))}
        </Select>
      </label>
      <h3>
        {player.gameName}{' '}
        <span className="meta">
          {team.name} · {player.champion} · {matchPosition(player.position)}
        </span>
      </h3>
      {!stats ? (
        <div className="empty-state">No hay estadísticas registradas para este jugador.</div>
      ) : (
        <>
          <div className="match-stat-highlights">
            <div>
              <span>KDA</span>
              <strong>
                {stats.kills == null || stats.assists == null || stats.deaths == null
                  ? '—'
                  : stats.deaths === 0
                    ? 'Sin muertes'
                    : ((stats.kills + stats.assists) / stats.deaths).toFixed(2)}
              </strong>
            </div>
            <div>
              <span>CS / minuto</span>
              <strong>{minutes && stats.cs != null ? (stats.cs / minutes).toFixed(1) : '—'}</strong>
            </div>
            <div>
              <span>Oro / minuto</span>
              <strong>
                {minutes && stats.goldEarned != null
                  ? Math.round(stats.goldEarned / minutes).toLocaleString('es-ES')
                  : '—'}
              </strong>
            </div>
            <div>
              <span>Daño / minuto</span>
              <strong>
                {minutes && stats.damageToChampions != null
                  ? Math.round(stats.damageToChampions / minutes).toLocaleString('es-ES')
                  : '—'}
              </strong>
            </div>
          </div>
          <div className="match-stat-groups">
            {statGroups.map((group) => (
              <section key={group.title} className="match-stat-group">
                <h4>{group.title}</h4>
                <dl>
                  {group.stats.map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{formatMatchStat(key, stats[key])}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <p className="meta">
            — indica un dato no registrado. Las estadísticas corresponden al mapa seleccionado.
          </p>
        </>
      )}
    </>
  );
}
