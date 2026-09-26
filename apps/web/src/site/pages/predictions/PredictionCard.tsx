import type { PredictionPick, PredictionSummary } from '@rcl/contracts';
import React, { useState } from 'react';
import { TeamBadge } from '../../../features/competition/components/TeamBadge.js';
import type { Match } from '../../../features/competition/types/competition.types.js';
export function PredictionCard({
  match,
  summary,
  pick,
  authenticated,
  save
}: {
  match: Match;
  summary: PredictionSummary;
  pick?: PredictionPick | undefined;
  authenticated: boolean;
  save: (pick: PredictionPick) => Promise<void>;
}) {
  const [team, setTeam] = useState(pick?.selectedTeamId ?? '');
  const [score, setScore] = useState(
    pick?.homeScore !== null && pick?.homeScore !== undefined
      ? `${pick.homeScore}:${pick.awayScore}`
      : ''
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const wins = Math.floor(match.bestOf / 2) + 1;
  const home = team === match.homeTeam?.id;
  const options = Array.from({ length: wins }, (_, loser) =>
    home ? `${wins}:${loser}` : `${loser}:${wins}`
  );
  const savedTeam = [match.homeTeam, match.awayTeam].find((t) => t?.id === pick?.selectedTeamId);
  return (
    <article className="prediction-card">
      <div className="prediction-teams">
        <span>
          <TeamBadge team={match.homeTeam} />
          {match.homeTeam?.name ?? 'Por definir'}
        </span>
        <b className="meta">VS</b>
        <span>
          <TeamBadge team={match.awayTeam} />
          {match.awayTeam?.name ?? 'Por definir'}
        </span>
      </div>
      {summary.closed ? (
        summary.homePercent !== null ? (
          <div className="prediction-community">
            <div className="prediction-gauge" aria-hidden="true">
              <span style={{ width: `${summary.homePercent}%` }} />
            </div>
            <div className="prediction-percent">
              <span>{summary.homePercent}%</span>
              <span>{100 - summary.homePercent}%</span>
            </div>
            <small>{summary.votes} votos de la comunidad</small>
          </div>
        ) : (
          <p className="prediction-notice">Sin votos para esta serie.</p>
        )
      ) : (
        <p className="prediction-notice">Los porcentajes se revelan al cerrar las votaciones.</p>
      )}
      {summary.open && authenticated && (
        <form
          className="prediction-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!team || saving) return;
            setSaving(true);
            setMessage('');
            const [homeScore, awayScore] = score ? score.split(':').map(Number) : [null, null];
            try {
              await save({
                matchId: match.id,
                selectedTeamId: team,
                homeScore: homeScore ?? null,
                awayScore: awayScore ?? null
              });
              setMessage('Predicción guardada.');
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
            } finally {
              setSaving(false);
            }
          }}
        >
          <fieldset disabled={saving}>
            <legend>Elige tu ganador</legend>
            <div className="prediction-choices">
              {[match.homeTeam, match.awayTeam].map(
                (t) =>
                  t && (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={team === t.id}
                      onClick={() => {
                        setTeam(t.id);
                        setScore('');
                        setMessage('');
                      }}
                    >
                      {t.name}
                    </button>
                  )
              )}
            </div>
          </fieldset>
          <label>
            Resultado exacto{' '}
            <select
              value={score}
              disabled={!team || saving}
              onChange={(event) => setScore(event.target.value)}
            >
              <option value="">Solo ganador</option>
              {options.map((value) => (
                <option key={value} value={value}>
                  {value.replace(':', ' — ')}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!team || saving}>
            {saving ? 'Guardando…' : pick ? 'Actualizar predicción' : 'Guardar predicción'}
          </button>
        </form>
      )}
      <div className="prediction-meta">
        <span>
          {match.scheduledAt
            ? new Intl.DateTimeFormat('es-ES', {
                timeZone: 'Europe/Madrid',
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit'
              }).format(new Date(match.scheduledAt))
            : 'Fecha por confirmar'}{' '}
          · {match.round?.name ?? 'Jornada'} · BO{match.bestOf}
        </span>
        <span className={pick ? 'prediction-saved' : ''}>
          {pick
            ? `✓ ${savedTeam?.name ?? 'Guardada'}${pick.homeScore !== null ? ` · ${pick.homeScore}–${pick.awayScore}` : ''}`
            : 'Sin predicción'}
        </span>
      </div>
      {!summary.open && <p className="prediction-notice">Votación cerrada</p>}
      <output className="prediction-feedback">{message}</output>
    </article>
  );
}
