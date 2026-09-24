import type { WeeklyTeam } from '@rcl/contracts';
import React from 'react';
import { DivisionSwitch } from '../../../features/competition/components/DivisionSwitch.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import { ContentStatus } from '../../../features/home-content/components/ContentStatus.js';
import { useHomeContent } from '../../../features/home-content/useHomeContent.js';
import '../../../features/home-content/components/editorial.css';

const roles = ['top', 'jungle', 'mid', 'adc', 'support'] as const;
const labels = { top: 'Top', jungle: 'Jungla', mid: 'Mid', adc: 'ADC', support: 'Support' };

export function TeamOfTheWeekStrip({ competition }: { competition: Competition }) {
  const content = useHomeContent<WeeklyTeam | null>(
    competition.division ? `weekly-teams/${competition.division.id}` : null
  );
  return (
    <section className="section totw-strip" aria-label="Team of the Week">
      <div className="totw-heading">
        <div>
          <div className="eyebrow">Team of the Week · El quinteto de la jornada</div>
          <p>
            {content.data?.label ?? 'La selección de nuestra liga'}
            {competition.division ? ` · ${competition.division.name}` : ''}
          </p>
        </div>
        <DivisionSwitch competition={competition} />
      </div>
      <ContentStatus {...content} />
      {competition.divisions.status === 'error' && (
        <div role="alert">
          No se pudieron cargar las divisiones.{' '}
          <button type="button" onClick={competition.retry}>
            Reintentar
          </button>
        </div>
      )}
      {!content.loading && !content.error && (
        <div className="totw-grid">
          {roles.map((role) => {
            const player = content.data?.players.find((item) => item.role === role);
            return (
              <article className="totw-card" key={role}>
                <span className="role-chip">{labels[role]}</span>
                {player?.imageUrl ? (
                  <img
                    className="totw-portrait"
                    src={player.imageUrl}
                    alt={player.name}
                    loading="lazy"
                  />
                ) : (
                  <div className="player-silhouette" aria-hidden="true">
                    ♜
                  </div>
                )}
                <h3>{player?.name ?? 'Por anunciar'}</h3>
                <p>{player?.team ?? 'Próxima selección'}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
