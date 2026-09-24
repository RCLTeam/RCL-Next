import { useEffect, useState } from 'react';
import { getCollection } from '../competition/api/competition-api.js';
import { getCompetitionDetail } from '../competition/api/competition-detail-api.js';
import type { Team, TeamMember } from '../competition/types/competition.types.js';

export interface WeeklyPlayerOption {
  id: string;
  memberId: string;
  name: string;
  team: string;
  tag: string | null;
  role: TeamMember['role'];
}

export async function loadWeeklyPlayers(divisionId: string, signal: AbortSignal) {
  const teams = await getCollection<Team>(
    `divisions/${encodeURIComponent(divisionId)}/teams`,
    signal
  );
  const details = await Promise.all(
    teams.map((team) => getCompetitionDetail('teams', encodeURIComponent(team.id), signal))
  );
  return details.flatMap((team): WeeklyPlayerOption[] =>
    team
      ? team.members
          .filter((member) =>
            ['top', 'jungle', 'mid', 'adc', 'support', 'substitute'].includes(member.role)
          )
          .map((member) => ({
            id: `${team.id}:${member.id}`,
            memberId: member.id,
            name: member.gameName ?? member.name,
            team: team.name,
            tag: member.riotTag,
            role: member.role
          }))
      : []
  );
}

export function useWeeklyPlayers(divisionId: string) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    divisionId: string;
    revision: number;
    data: WeeklyPlayerOption[];
    error?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    loadWeeklyPlayers(divisionId, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ divisionId, revision, data });
      },
      () => {
        if (!controller.signal.aborted)
          setResult({
            divisionId,
            revision,
            data: [],
            error: 'No se pudieron cargar los jugadores de esta división.'
          });
      }
    );
    return () => controller.abort();
  }, [divisionId, revision]);
  const current =
    result?.divisionId === divisionId && result.revision === revision ? result : undefined;
  return {
    data: current?.data ?? [],
    error: current?.error,
    loading: !current,
    retry: () => setRevision((value) => value + 1)
  };
}
