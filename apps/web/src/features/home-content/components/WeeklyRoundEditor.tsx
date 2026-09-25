import type { WeeklyCandidate, WeeklyPlayer, WeeklyTeam, WeeklyTeamInput } from '@rcl/contracts';
import React, { useState } from 'react';
import { Select } from '../../../shared/components/Selector/Selector.js';
import type { Round } from '../../competition/types/competition.types.js';
import { saveWeeklyTeam } from '../home-content-api.js';
import { useHomeContent } from '../useHomeContent.js';
import { ContentStatus } from './ContentStatus.js';
import type { EditorStateProps } from './HomeContentPanel.js';

const roles = ['top', 'jungle', 'mid', 'adc', 'support'] as const;
const labels = { top: 'Top', jungle: 'Jungla', mid: 'Mid', adc: 'ADC', support: 'Support' };
type Props = EditorStateProps & {
  divisionId: string;
  round: Round;
  initial: WeeklyTeam | null;
  onSaved: (team: WeeklyTeam) => void;
};
export function WeeklyRoundEditor(props: Props) {
  const candidates = useHomeContent<WeeklyCandidate[]>(
    `admin/weekly-teams/${props.divisionId}/candidates/${props.round.id}`
  );
  return (
    <>
      <ContentStatus {...candidates} />
      {candidates.data && <WeeklyRoundForm {...props} candidates={candidates.data} />}
    </>
  );
}
function WeeklyRoundForm({
  divisionId,
  round,
  initial,
  candidates,
  onDirty,
  onBusy,
  onSaved
}: Props & { candidates: WeeklyCandidate[] }) {
  const [form, setForm] = useState<WeeklyTeamInput>({
    roundId: Number(round.id),
    label: `Jornada ${round.id}`,
    published: initial?.roundId === Number(round.id) && initial.published,
    players: roles.map(
      (role) =>
        initial?.players.find((item) => item.role === role) ?? {
          role,
          name: '',
          team: '',
          imageUrl: ''
        }
    )
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  function update(patch: Partial<WeeklyTeamInput>) {
    setForm((value) => ({ ...value, ...patch }));
    onDirty(true);
    setMessage('');
  }
  function updatePlayer(role: WeeklyPlayer['role'], patch: Partial<WeeklyPlayer>) {
    update({
      players: form.players.map((player) =>
        player.role === role ? { ...player, ...patch } : player
      )
    });
  }
  return (
    <form
      className="content-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        onBusy(true);
        setError('');
        try {
          const saved = await saveWeeklyTeam(divisionId, form);
          setForm({
            roundId: Number(round.id),
            label: saved.label,
            published: saved.published,
            players: saved.players
          });
          onDirty(false);
          onSaved(saved);
          setMessage(
            form.published
              ? 'Quinteto publicado para esta jornada.'
              : 'Borrador guardado para esta jornada.'
          );
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : 'No se pudo guardar.');
        } finally {
          setBusy(false);
          onBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <legend>El quinteto de la jornada</legend>
        <p>
          Cada selector muestra solo jugadores que disputaron esa posición en la jornada. Los splash
          arts de todos los campeones que hayan jugado en esta jornada se alternarán automáticamente
          en sus tarjetas.
        </p>
        {!candidates.length && (
          <p>
            No hay partidas importadas en esta jornada. Importa sus ROFL para elegir jugadores y
            campeones.
          </p>
        )}
        <div className="weekly-edit-grid">
          {form.players.map((player) => {
            const eligible = candidates.filter((item) => item.roles.includes(player.role));
            const candidate = eligible.find(
              (item) => item.playerId === player.playerId && item.teamId === player.teamId
            );
            const chosen = new Set(
              form.players
                .filter((item) => item.role !== player.role)
                .flatMap((item) =>
                  candidates
                    .filter(
                      (option) => option.playerId === item.playerId && option.teamId === item.teamId
                    )
                    .map((option) => option.memberId)
                )
            );
            return (
              <div className="weekly-edit-card" key={player.role}>
                <span className="eyebrow">{labels[player.role]}</span>
                <div className="content-field">
                  <label htmlFor={`weekly-player-${player.role}`}>
                    Jugador · {labels[player.role]}
                  </label>
                  <Select
                    variant="form"
                    id={`weekly-player-${player.role}`}
                    value={candidate ? `${candidate.teamId}:${candidate.playerId}` : ''}
                    required
                    onChange={(event) => {
                      const selected = eligible.find(
                        (item) => `${item.teamId}:${item.playerId}` === event.target.value
                      );
                      updatePlayer(player.role, {
                        playerId: selected?.playerId ?? '',
                        teamId: selected?.teamId ?? '',
                        name: selected?.name ?? '',
                        team: selected?.team ?? '',
                        champions: selected?.champions ?? [],
                        imageUrl: ''
                      });
                    }}
                  >
                    <option value="">
                      {eligible.length ? 'Seleccionar jugador' : 'Sin jugadores en esta posición'}
                    </option>
                    {eligible.map((item) => (
                      <option
                        key={`${item.teamId}:${item.playerId}`}
                        value={`${item.teamId}:${item.playerId}`}
                        disabled={chosen.has(item.memberId)}
                      >
                        {item.name}
                        {item.tag ? `#${item.tag}` : ''} — {item.team}
                      </option>
                    ))}
                  </Select>
                </div>
                {!candidate && player.name && (
                  <p>
                    Selección anterior: {player.name} · {player.team}. Confirma un jugador de esta
                    jornada.
                  </p>
                )}
                <p>{candidate?.team ?? 'El equipo se asigna automáticamente.'}</p>
                {candidate && <p>Campeones: {candidate.champions.join(', ')}</p>}
              </div>
            );
          })}
        </div>
        <label className="content-check">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(event) => update({ published: event.target.checked })}
          />
          Publicado en la home
        </label>
        <button type="submit" className="content-primary" disabled={!candidates.length}>
          {busy ? 'Guardando…' : 'Guardar quinteto de la jornada'}
        </button>
      </fieldset>
      {message && <output>{message}</output>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
