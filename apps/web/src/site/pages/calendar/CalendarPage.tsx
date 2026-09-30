import React, { useState, useEffect } from 'react';
import {
  DataState,
  resolveCompetitionState
} from '../../../features/competition/components/CompetitionDataState.js';
import { CompetitionFilters } from '../../../features/competition/components/CompetitionFilters.js';
import { RoundFilter } from '../../../features/competition/components/RoundFilter.js';
import type { Competition } from '../../../features/competition/hooks/useCompetition.js';
import type { Round } from '../../../features/competition/types/competition.types.js';
import { PageLayout } from '../../../shared/components/PageLayout/PageLayout.js';
import { MatchList } from './MatchList.js';
import './calendar.css';

function getClosestRoundId(rounds: Round[]): string {
  if (!rounds.length) return '';
  const now = Date.now();
  const sortedRounds = [...rounds].sort((a, b) => {
    const timeA = a.startsAt ? new Date(a.startsAt).getTime() : 0;
    const timeB = b.startsAt ? new Date(b.startsAt).getTime() : 0;
    return timeA - timeB;
  });

  let closestRound = sortedRounds[0] ?? rounds[0];
  if (!closestRound) return '';
  for (const round of sortedRounds) {
    if (round.startsAt) {
      const startTime = new Date(round.startsAt).getTime();
      if (startTime <= now) {
        closestRound = round;
      } else {
        break;
      }
    }
  }
  return closestRound.id;
}

export function CalendarPage({ competition }: { competition: Competition }) {
  const [roundChoice, setRoundChoice] = useState('');
  const roundKey = `${competition.division?.id ?? ''}:`;
  const rounds = competition.rounds.data;
  useEffect(() => {
    if (!rounds.length) return;
    function updateRound() {
      const closestId = getClosestRoundId(rounds);
      setRoundChoice(`${roundKey}${closestId}`);
    }
    updateRound();
    const now = Date.now();
    const upcomingTimes = rounds
      .map((r) => (r.startsAt ? new Date(r.startsAt).getTime() : 0))
      .filter((time) => time > now)
      .sort((a, b) => a - b);
    const nextRoundTime = upcomingTimes[0];
    if (nextRoundTime !== undefined) {
      const timeUntilNext = nextRoundTime - now;
      const timer = setTimeout(() => {
        updateRound();
      }, timeUntilNext);
      return () => clearTimeout(timer);
    }
  }, [rounds, roundKey]);
  const roundId = roundChoice.startsWith(roundKey) ? roundChoice.slice(roundKey.length) : '';
  const matches = competition.calendar.data.filter(
    (match) => !roundId || match.round?.id === roundId
  );
  return (
    <PageLayout
      id="calendario"
      number="03"
      title="Calendario"
      subtitle="Cada mapa cuenta"
      description="Consulta los encuentros, las jornadas y los resultados de tu división."
      toolbar={
        <CompetitionFilters competition={competition}>
          <RoundFilter
            rounds={rounds}
            value={roundId}
            onChange={(value) => setRoundChoice(`${roundKey}${value}`)}
          />
        </CompetitionFilters>
      }
    >
      {competition.rounds.status === 'error' && (
        <p className="status-note" role="alert">
          No se pudieron cargar los filtros de jornada.{' '}
          <button type="button" onClick={competition.retry}>
            Reintentar
          </button>
        </p>
      )}
      <DataState
        state={resolveCompetitionState(competition, competition.calendar)}
        empty="Todavía no hay partidos programados en esta división."
        retry={competition.retry}
      >
        <MatchList matches={matches} />
      </DataState>
    </PageLayout>
  );
}
