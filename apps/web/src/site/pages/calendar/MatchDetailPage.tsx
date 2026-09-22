import type { MatchDetail, MatchMap, MatchParticipant } from '@rcl/contracts';
import React, { useEffect, useState } from 'react';
import { TeamBadge } from '../../../features/competition/components/CompetitionViews.js';
import { PageLayout } from '../../../shared/components/PageLayout.js';
import { SiteLink } from '../../../shared/components/SiteLink.js';
import { type GameCatalog, GameIcon, useGameCatalog } from './match-assets.js';
import { matchPosition, positionRows, statGroups, statNumber } from './match-stats.js';
import './match-detail.css';

function PlayerSummary({
  player,
  catalog
}: { player: MatchParticipant | undefined; catalog: GameCatalog }) {
  if (!player) return <div className="match-player empty-state">Jugador no disponible</div>;
  const build = player.build;
  return (
    <div className="match-player">
      <div className="match-player-identity">
        <GameIcon kind="champion" id={player.champion} catalog={catalog} />
        <div>
          <strong>
            {player.gameName}
            {player.riotTag ? `#${player.riotTag}` : ''}
          </strong>
          <span>
            {player.champion}
            {player.stats?.isMvp ? ' · MVP' : ''}
          </span>
        </div>
        <strong className="player-kda" title="Asesinatos / Muertes / Asistencias">
          {player.stats
            ? `${statNumber(player.stats.kills)} / ${statNumber(player.stats.deaths)} / ${statNumber(player.stats.assists)}`
            : 'K/D/A —'}
        </strong>
      </div>
      {build ? (
        <div className="match-build" aria-label={`Build de ${player.gameName}`}>
          {[
            build.item0,
            build.item1,
            build.item2,
            build.item3,
            build.item4,
            build.item5,
            build.trinket
          ].map((id, slot) => (
            <GameIcon key={`${slot}-${id}`} kind="item" id={id} catalog={catalog} />
          ))}
          <span className="match-spells">
            <GameIcon kind="summoner" id={build.summonerSpell1Id} catalog={catalog} />
            <GameIcon kind="summoner" id={build.summonerSpell2Id} catalog={catalog} />
          </span>
        </div>
      ) : (
        <p className="meta">Build no disponible</p>
      )}
    </div>
  );
}

function DetailedStats({ game, match }: { game: MatchMap; match: MatchDetail }) {
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
      <label className="select-field match-player-select">
        Seleccionar jugador
        <select value={player.id} onChange={(event) => setChoice(event.target.value)}>
          {ordered.map((item) => (
            <option key={item.id} value={item.id}>
              {item.gameName} ·{' '}
              {item.teamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name} ·{' '}
              {matchPosition(item.position)}
            </option>
          ))}
        </select>
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
                      <dd>{statNumber(stats[key])}</dd>
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

function PlayerRunes({ player, catalog }: { player: MatchParticipant; catalog: GameCatalog }) {
  const runes = player.runes;
  return (
    <article className="match-rune-card">
      <h4>{player.gameName}</h4>
      <p className="meta">
        {matchPosition(player.position)} · {player.champion}
      </p>
      {!runes ? (
        <p>Runas no disponibles.</p>
      ) : (
        <>
          <div className="match-rune-tree">
            <GameIcon kind="rune" id={runes.primaryPerk} catalog={catalog} label />
            <div className="match-rune-list">
              {[
                runes.primaryKeystoneId,
                runes.primaryPerk1,
                runes.primaryPerk2,
                runes.primaryPerk3
              ].map((id, index) => (
                <GameIcon key={`${index}-${id}`} kind="rune" id={id} catalog={catalog} label />
              ))}
            </div>
          </div>
          <div className="match-rune-tree">
            <GameIcon kind="rune" id={runes.secundaryRuneId} catalog={catalog} label />
            <div className="match-rune-list">
              {[runes.secundaryPerk1, runes.secundaryPerk2].map((id, index) => (
                <GameIcon key={`${index}-${id}`} kind="rune" id={id} catalog={catalog} label />
              ))}
            </div>
          </div>
          <dl className="match-shards">
            {[
              ['Ofensiva', runes.statPerkOffense],
              ['Flexible', runes.statPerkFlex],
              ['Defensiva', runes.statPerkDefense]
            ].map(([label, id]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <GameIcon kind="rune" id={id ?? null} catalog={catalog} label />
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </article>
  );
}

export function MatchReport({
  match,
  catalog = {}
}: { match: MatchDetail; catalog?: GameCatalog }) {
  const [gameChoice, setGameChoice] = useState('');
  const game = match.games.find((item) => item.id === gameChoice) ?? match.games[0];
  const rows = game ? positionRows(game.participants, match.homeTeam.id, match.awayTeam.id) : [];
  const winner =
    game?.winnerTeamId === match.homeTeam.id
      ? match.homeTeam.name
      : game?.winnerTeamId === match.awayTeam.id
        ? match.awayTeam.name
        : null;
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
      {match.games.length > 0 && (
        <div className="match-map-picker" aria-label="Seleccionar mapa">
          {match.games.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={game?.id === item.id}
              onClick={() => setGameChoice(item.id)}
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
      <nav className="match-section-nav" aria-label="Secciones del partido">
        <a href="#enfrentamientos">01 · Enfrentamientos</a>
        <a href="#estadisticas">02 · Estadísticas</a>
        <a href="#runas">03 · Runas</a>
      </nav>
      <section id="enfrentamientos" className="match-report-section">
        <h2>01 · Enfrentamientos por posición</h2>
        <p className="meta">Campeones, K/D/A y build final</p>
        {!game ? (
          <div className="empty-state">
            El resultado está registrado, pero todavía no se han importado los datos de las
            partidas.
          </div>
        ) : (
          <>
            <div className="match-lane-heading">
              <span>
                {match.homeTeam.name} ·{' '}
                {game.blueTeamId === match.homeTeam.id ? 'Lado azul' : 'Lado rojo'}
              </span>
              <span>Posición</span>
              <span>
                {match.awayTeam.name} ·{' '}
                {game.blueTeamId === match.awayTeam.id ? 'Lado azul' : 'Lado rojo'}
              </span>
            </div>
            {rows.map((row) => (
              <div className="match-lane-row" key={row.key}>
                <PlayerSummary player={row.home} catalog={catalog} />
                <span className="match-lane-label">{row.position}</span>
                <PlayerSummary player={row.away} catalog={catalog} />
              </div>
            ))}
          </>
        )}
      </section>
      <section id="estadisticas" className="match-report-section">
        <h2>02 · Estadísticas de jugadores</h2>
        {game ? (
          <DetailedStats key={game.id} game={game} match={match} />
        ) : (
          <div className="empty-state">Estadísticas pendientes de importar.</div>
        )}
      </section>
      <section id="runas" className="match-report-section">
        <h2>03 · Runas</h2>
        {game?.participants.length ? (
          <div className="match-runes-teams">
            {[match.homeTeam, match.awayTeam].map((team) => (
              <section key={team.id}>
                <h3>{team.name}</h3>
                {rows
                  .flatMap((row) => [row.home, row.away])
                  .filter(
                    (player): player is MatchParticipant => !!player && player.teamId === team.id
                  )
                  .map((player) => (
                    <PlayerRunes key={player.id} player={player} catalog={catalog} />
                  ))}
              </section>
            ))}
          </div>
        ) : (
          <div className="empty-state">Runas pendientes de importar.</div>
        )}
      </section>
    </>
  );
}

type ReportState =
  | { status: 'loading' | 'error' | 'missing' }
  | { status: 'ready'; match: MatchDetail };
export function MatchDetailPage({ matchId }: { matchId: string }) {
  const [state, setState] = useState<ReportState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const catalog = useGameCatalog();
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision retries a failed request.
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    async function load() {
      try {
        const response = await fetch(`/api/v1/matches/${matchId}`, {
          signal: controller.signal,
          credentials: 'include'
        });
        if (controller.signal.aborted) return;
        if (response.status === 404 || response.status === 422) {
          setState({ status: 'missing' });
          return;
        }
        if (!response.ok) throw new Error('Match failed');
        const body = await response.json();
        if (!body.data || !Array.isArray(body.data.games)) throw new Error('Invalid match');
        if (!controller.signal.aborted) setState({ status: 'ready', match: body.data });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' });
      }
    }
    void load();
    return () => controller.abort();
  }, [matchId, revision]);
  useEffect(() => {
    if (state.status === 'ready')
      document.title = `${state.match.homeTeam.name} vs ${state.match.awayTeam.name} · Rebel Crown Legacy`;
  }, [state]);
  return (
    <PageLayout
      id="partido"
      number="03"
      title="Ficha del partido"
      subtitle="Cada mapa cuenta"
      description="El resultado y todos los detalles de la serie."
      toolbar={
        <SiteLink className="text-link" href="/calendario">
          ← Volver al calendario
        </SiteLink>
      }
    >
      {state.status === 'loading' && <output className="empty-state">Cargando partido…</output>}
      {state.status === 'missing' && (
        <div className="empty-state">
          Partido no disponible. La ficha se publica al terminar el encuentro.
        </div>
      )}
      {state.status === 'error' && (
        <div className="empty-state error-state" role="alert">
          <p>No se pudo cargar el partido.</p>
          <button
            className="btn-ghost"
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Reintentar
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <MatchReport key={state.match.id} match={state.match} catalog={catalog} />
      )}
    </PageLayout>
  );
}
