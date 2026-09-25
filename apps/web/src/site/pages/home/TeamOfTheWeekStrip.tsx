import type { WeeklyTeam } from '@rcl/contracts';
import React, { useState } from 'react';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { ContentStatus } from '../../../features/home-content/components/ContentStatus.js';
import { useHomeContent } from '../../../features/home-content/useHomeContent.js';
import { Select } from '../../../shared/components/Selector/Selector.js';
import { WeeklyChampionBackground } from './WeeklyChampionBackground.js';

const roles = ['top', 'jungle', 'mid', 'adc', 'support'] as const;
const labels = { top: 'Top', jungle: 'Jungla', mid: 'Mid', adc: 'ADC', support: 'Support' };
export function TeamOfTheWeekStrip({ competition }: { competition: Competition }) {
  const selectId = React.useId();
  const [selection, setSelection] = useState<{ divisionId: string; roundId: number }>();
  const content = useHomeContent<WeeklyTeam[]>(
    competition.division ? `weekly-teams/${competition.division.id}/rounds` : null
  );
  const team =
    content.data?.find(
      (item) =>
        competition.division?.id === selection?.divisionId && item.roundId === selection?.roundId
    ) ?? content.data?.[0];
  return (
    <section className="totw-strip" aria-label="Team of the Week">
      <div className="totw-heading">
        <div className="eyebrow">Team of the Week · El quinteto de la jornada</div>
      </div>
      {content.data && content.data.length > 0 && (
        <label htmlFor={`${selectId}-1`} className="select-field totw-round-select">
          Jornada
          <Select
            id={`${selectId}-1`}
            value={team?.roundId ?? ''}
            onChange={(event) =>
              setSelection({
                divisionId: competition.division?.id ?? '',
                roundId: Number(event.target.value)
              })
            }
          >
            {content.data.map((item) => (
              <option key={item.roundId} value={item.roundId ?? ''}>
                Jornada {item.roundId}
              </option>
            ))}
          </Select>
        </label>
      )}
      <ContentStatus {...content} />
      {!content.loading && !content.error && !team && (
        <p>No hay quintetos publicados para esta división.</p>
      )}
      {!content.loading && !content.error && (
        <div className="totw-grid">
          {roles.map((role) => {
            const player = team?.players.find((item) => item.role === role);
            return (
              <article
                className={`totw-card${player ? ' totw-champion-card' : ''}`}
                key={`${team?.roundId}:${role}`}
              >
                <WeeklyChampionBackground champions={player?.champions ?? []} />
                <div className="totw-player-content">
                  <span className="role-chip">{labels[role]}</span>
                  {!player && (
                    <div className="player-silhouette" aria-hidden="true">
                      ♜
                    </div>
                  )}
                  <h3>{player?.name ?? 'Por anunciar'}</h3>
                  <p>{player?.team ?? 'Próxima selección'}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
