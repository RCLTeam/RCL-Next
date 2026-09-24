import type { WeeklyTeam, WeeklyTeamInput } from '@rcl/contracts';
import React, { useState } from 'react';
import { useCompetitionSelection } from '../../competition/hooks/useCompetitionSelection.js';
import { saveWeeklyTeam } from '../home-content-api.js';
import { useHomeContent } from '../useHomeContent.js';
import { useWeeklyPlayers } from '../useWeeklyPlayers.js';
import { ContentField } from './ContentField.js';
import { ContentStatus } from './ContentStatus.js';
import type { EditorStateProps } from './HomeContentPanel.js';

const roles = ['top', 'jungle', 'mid', 'adc', 'support'] as const;
const labels = { top: 'Top', jungle: 'Jungla', mid: 'Mid', adc: 'ADC', support: 'Support' };
export function WeeklyTeamManager(props: EditorStateProps) {
  const competition = useCompetitionSelection();
  const [busy, setBusy] = useState(false);
  const content = useHomeContent<WeeklyTeam | null>(
    competition.division ? `admin/weekly-teams/${competition.division.id}` : null
  );
  function change(value: string, select: (value: string) => void) {
    if (props.dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
    props.onDirty(false);
    select(value);
  }
  return (
    <section aria-label="Editar Team of the Week">
      <div className="content-filters">
        <label>
          Temporada
          <select
            value={competition.season?.id ?? ''}
            disabled={busy}
            onChange={(event) => change(event.target.value, competition.selectSeason)}
          >
            {competition.seasons.data.map((season) => (
              <option value={season.id} key={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          División
          <select
            value={competition.division?.id ?? ''}
            disabled={busy}
            onChange={(event) => change(event.target.value, competition.selectDivision)}
          >
            {competition.divisions.data.map((division) => (
              <option value={division.id} key={division.id}>
                {division.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ContentStatus
        loading={
          competition.seasons.status === 'loading' || competition.divisions.status === 'loading'
        }
        error={
          competition.seasons.status === 'error' || competition.divisions.status === 'error'
            ? 'No se pudieron cargar las temporadas o divisiones.'
            : undefined
        }
        retry={competition.retry}
      />
      <ContentStatus {...content} />
      {!competition.division &&
        competition.seasons.status === 'ready' &&
        competition.divisions.status === 'ready' && (
          <p>Crea una temporada y sus divisiones desde CRUD Operations para añadir un quinteto.</p>
        )}
      {competition.division && content.data !== undefined && (
        <WeeklyTeamForm
          key={competition.division.id}
          divisionId={competition.division.id}
          initial={content.data}
          {...props}
          onBusy={(value) => {
            setBusy(value);
            props.onBusy(value);
          }}
        />
      )}
    </section>
  );
}

function WeeklyTeamForm({
  divisionId,
  initial,
  onDirty,
  onBusy
}: EditorStateProps & { divisionId: string; initial: WeeklyTeam | null }) {
  const roster = useWeeklyPlayers(divisionId);
  const [form, setForm] = useState<WeeklyTeamInput>(
    initial
      ? { label: initial.label, published: initial.published, players: initial.players }
      : {
          label: '',
          published: false,
          players: roles.map((role) => ({ role, name: '', team: '', imageUrl: '' }))
        }
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  function update(value: Partial<WeeklyTeamInput>) {
    setForm((current) => ({ ...current, ...value }));
    onDirty(true);
    setMessage('');
  }
  return (
    <form
      className="content-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        onBusy(true);
        setError('');
        setMessage('');
        try {
          await saveWeeklyTeam(divisionId, form);
          onDirty(false);
          setMessage(
            form.published ? 'Quinteto publicado en la home.' : 'Quinteto guardado como borrador.'
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
          Elige un jugador para cada posición. Su equipo se completa automáticamente. Al guardar
          sustituyes el quinteto actual de esta división.
        </p>
        <ContentField
          label="Jornada o título de la selección"
          value={form.label}
          maxLength={120}
          onChange={(label) => update({ label })}
        />
        <ContentStatus {...roster} />
        {!roster.loading && !roster.error && roster.data.length === 0 && (
          <p>
            No hay jugadores en las plantillas de esta división. Añádelos desde CRUD Operations →
            Plantillas.
          </p>
        )}
        <div className="weekly-edit-grid">
          {roles.map((role) => {
            const player = form.players.find((item) => item.role === role);
            if (!player) return null;
            const selected = roster.data.find(
              (option) => option.name === player.name && option.team === player.team
            );
            const selectedElsewhere = new Set(
              form.players
                .filter((item) => item.role !== role)
                .flatMap((item) =>
                  roster.data
                    .filter((option) => option.name === item.name && option.team === item.team)
                    .map((option) => option.memberId)
                )
            );
            const options = [...roster.data].sort(
              (a, b) =>
                Number(b.role === role) - Number(a.role === role) ||
                a.team.localeCompare(b.team) ||
                a.name.localeCompare(b.name)
            );
            const change = (patch: Partial<typeof player>) =>
              update({
                players: form.players.map((item) =>
                  item.role === role ? { ...item, ...patch } : item
                )
              });
            return (
              <div className="weekly-edit-card" key={role}>
                <span className="eyebrow">{labels[role]}</span>
                <div className="content-field">
                  <label htmlFor={`weekly-player-${role}`}>Jugador · {labels[role]}</label>
                  <select
                    id={`weekly-player-${role}`}
                    required
                    disabled={roster.loading || !!roster.error}
                    value={selected?.id ?? (player.name ? 'saved' : '')}
                    onChange={(event) => {
                      const option = roster.data.find((item) => item.id === event.target.value);
                      change({ name: option?.name ?? '', team: option?.team ?? '', imageUrl: '' });
                    }}
                  >
                    <option value="">Seleccionar jugador</option>
                    {!selected && player.name && (
                      <option value="saved">
                        {player.name} — {player.team} (selección guardada)
                      </option>
                    )}
                    {options.map((option) => (
                      <option
                        key={option.id}
                        value={option.id}
                        disabled={selectedElsewhere.has(option.memberId)}
                      >
                        {option.name}
                        {option.tag ? `#${option.tag}` : ''} — {option.team}
                        {option.role === role ? ' · Posición habitual' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <p>{player.team || 'El equipo se asigna al seleccionar un jugador.'}</p>
                <details>
                  <summary>Foto opcional</summary>
                  <ContentField
                    label="URL de la foto"
                    type="url"
                    required={false}
                    value={player.imageUrl}
                    maxLength={2000}
                    onChange={(imageUrl) => change({ imageUrl })}
                    hint="Imagen pública con HTTPS."
                  />
                </details>
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
        <button
          type="submit"
          className="content-primary"
          disabled={roster.loading || !!roster.error}
        >
          {busy ? 'Guardando…' : 'Guardar quinteto'}
        </button>
      </fieldset>
      {message && <output>{message}</output>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
