import type { MatchDetail, MatchParticipant } from '@rcl/contracts';
import React, { useState } from 'react';
import { TeamBadge } from '../../../features/competition/components/TeamBadge.js';
import type { GameCatalog } from '../../../shared/riot/riot-assets.service.js';
import { MatchLaneComparison } from './MatchLaneComparison.js';
import { MatchMapTabs } from './MatchMapTabs.js';
import { MatchPlayerRunes } from './MatchPlayerRunes.js';
import { MatchSectionTabs } from './MatchSectionTabs.js';
import { MatchStatsTable } from './MatchStatsTable.js';
import { matchPosition, positionRows } from './match-stats.js';
import './match-detail.css';

export function MatchReport({
  match,
  catalog = {}
}: { match: MatchDetail; catalog?: GameCatalog }) {
  const [gameChoice, setGameChoice] = useState('');
  const [section, setSection] = useState('enfrentamientos');
  const [runeChoice, setRuneChoice] = useState('');
  const game = match.games.find((item) => item.id === gameChoice) ?? match.games[0];
  const rows = game ? positionRows(game.participants, match.homeTeam.id, match.awayTeam.id) : [];
  const players = rows
    .flatMap((row) => [row.home, row.away])
    .filter((player): player is MatchParticipant => !!player);
  const runePlayer = players.find((player) => player.id === runeChoice) ?? players[0];
  return (
    <>
      <div className="match-report-score">
        <div>
          <TeamBadge team={match.homeTeam} />
          <h2>{match.homeTeam.name}</h2>
        </div>
        <div>
          <span className="meta">
            {match.status === 'forfeit' ? 'Incomparecencia' : 'Resultado final'} · BO{match.bestOf}
          </span>
          <strong>
            {match.homeScore}–{match.awayScore}
          </strong>
        </div>
        <div>
          <TeamBadge team={match.awayTeam} />
          <h2>{match.awayTeam.name}</h2>
        </div>
      </div>
      <p className="match-report-context">
        {match.seasonName} · {match.divisionName}
        {match.roundName ? ` · ${match.roundName}` : ''}
      </p>
      <MatchMapTabs match={match} game={game} onSelect={setGameChoice} />
      <MatchSectionTabs section={section} onSelect={setSection} />
      <section
        id="enfrentamientos"
        role="tabpanel"
        aria-labelledby="tab-enfrentamientos"
        hidden={section !== 'enfrentamientos'}
        className="match-report-section"
      >
        <h2>01 · Enfrentamientos por posición</h2>
        <p className="meta">Campeones, K/D/A y build final</p>
        <MatchLaneComparison game={game} match={match} catalog={catalog} />
      </section>
      <section
        id="estadisticas"
        role="tabpanel"
        aria-labelledby="tab-estadisticas"
        hidden={section !== 'estadisticas'}
        className="match-report-section"
      >
        <h2>02 · Estadísticas de jugadores</h2>
        {game ? (
          <MatchStatsTable key={game.id} game={game} match={match} />
        ) : (
          <div className="empty-state">Estadísticas pendientes de importar.</div>
        )}
      </section>
      <section
        id="runas"
        role="tabpanel"
        aria-labelledby="tab-runas"
        hidden={section !== 'runas'}
        className="match-report-section"
      >
        <h2>03 · Runas</h2>
        {runePlayer ? (
          <>
            <label className="select-field match-player-select">
              Seleccionar jugador para runas
              <select value={runePlayer.id} onChange={(event) => setRuneChoice(event.target.value)}>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.gameName} ·{' '}
                    {player.teamId === match.homeTeam.id
                      ? match.homeTeam.name
                      : match.awayTeam.name}{' '}
                    · {matchPosition(player.position)}
                  </option>
                ))}
              </select>
            </label>
            <MatchPlayerRunes key={runePlayer.id} player={runePlayer} catalog={catalog} />
          </>
        ) : (
          <div className="empty-state">Runas pendientes de importar.</div>
        )}
      </section>
    </>
  );
}
