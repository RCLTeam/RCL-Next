import type { WeeklyTeam } from '@rcl/contracts';
import React, { useState } from 'react';
import { useCollection } from '../../competition/hooks/useCollection.js';
import { useCompetitionSelection } from '../../competition/hooks/useCompetitionSelection.js';
import type { Round } from '../../competition/types/competition.types.js';
import { useHomeContent } from '../useHomeContent.js';
import { ContentStatus } from './ContentStatus.js';
import type { EditorStateProps } from './HomeContentPanel.js';
import { WeeklyRoundEditor } from './WeeklyRoundEditor.js';

export function WeeklyTeamManager(props: EditorStateProps) {
  const competition = useCompetitionSelection();
  const [busy, setBusy] = useState(false);
  const [savedTeams, setSavedTeams] = useState<WeeklyTeam[]>([]);
  const [roundChoice, setRoundChoice] = useState('');
  const divisionId = competition.division?.id;
  const rounds = useCollection<Round>(
    divisionId ? `divisions/${divisionId}/rounds` : null,
    competition.revision
  );
  const round = rounds.data.find((item) => item.id === roundChoice) ?? rounds.data.at(-1);
  const content = useHomeContent<WeeklyTeam[]>(
    divisionId ? `admin/weekly-teams/${divisionId}/rounds` : null
  );
  function change(value: string, select: (value: string) => void) {
    if (props.dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
    props.onDirty(false);
    select(value);
  }
  const currentTeams = [
    ...savedTeams.filter((item) => item.divisionId === divisionId),
    ...(content.data ?? []).filter(
      (item) =>
        !savedTeams.some(
          (saved) => saved.divisionId === item.divisionId && saved.roundId === item.roundId
        )
    )
  ];
  const initial = currentTeams.find((item) => item.roundId === Number(round?.id)) ?? null;
  const legacy = content.data?.find((item) => item.roundId === null);
  return (
    <section aria-label="Editar Team of the Week">
      <div className="content-filters">
        <label>
          Temporada
          <select
            value={competition.season?.id ?? ''}
            disabled={busy}
            onChange={(event) =>
              change(event.target.value, (value) => {
                setRoundChoice('');
                competition.selectSeason(value);
              })
            }
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
            value={divisionId ?? ''}
            disabled={busy}
            onChange={(event) =>
              change(event.target.value, (value) => {
                setRoundChoice('');
                competition.selectDivision(value);
              })
            }
          >
            {competition.divisions.data.map((division) => (
              <option value={division.id} key={division.id}>
                {division.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Jornada
          <select
            value={round?.id ?? ''}
            disabled={busy || rounds.status !== 'ready'}
            onChange={(event) => change(event.target.value, setRoundChoice)}
          >
            {rounds.data.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name ?? `Jornada ${item.sequence}`}
                {currentTeams.some((team) => team.roundId === Number(item.id) && team.published)
                  ? ' · Publicada'
                  : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ContentStatus
        loading={
          competition.seasons.status === 'loading' ||
          competition.divisions.status === 'loading' ||
          rounds.status === 'loading'
        }
        error={
          [competition.seasons.status, competition.divisions.status, rounds.status].includes(
            'error'
          )
            ? 'No se pudieron cargar las temporadas, divisiones o jornadas.'
            : undefined
        }
        retry={competition.retry}
      />
      <ContentStatus {...content} />
      {divisionId && rounds.status === 'ready' && !round && (
        <p>Crea las jornadas de esta división desde CRUD Operations.</p>
      )}
      {legacy && (
        <p>
          Existe una selección anterior sin jornada. Se conserva como referencia. Selecciona su
          jornada y confirma los jugadores para publicarla.
        </p>
      )}
      {divisionId && round && content.data && (
        <WeeklyRoundEditor
          key={`${divisionId}:${round.id}`}
          divisionId={divisionId}
          round={round}
          initial={initial ?? legacy ?? null}
          {...props}
          onSaved={(saved) =>
            setSavedTeams((items) => [
              ...items.filter(
                (item) => item.divisionId !== saved.divisionId || item.roundId !== saved.roundId
              ),
              saved
            ])
          }
          onBusy={(value) => {
            setBusy(value);
            props.onBusy(value);
          }}
        />
      )}
    </section>
  );
}
