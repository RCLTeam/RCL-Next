import type { MatchParticipant, MatchStatKey } from '@rcl/contracts';
export const positions = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;
export function matchPosition(position: string | null) {
  const value = position?.trim().toUpperCase();
  if (value === 'MIDDLE') return 'MID';
  if (value === 'BOTTOM' || value === 'BOT') return 'ADC';
  if (value === 'UTILITY' || value === 'SUP') return 'SUPPORT';
  return positions.find((role) => role === value) ?? 'SIN POSICIÓN';
}
export function positionRows(
  participants: MatchParticipant[],
  homeTeamId: string,
  awayTeamId: string
) {
  return [...positions, 'SIN POSICIÓN'].flatMap((position) => {
    const home = participants.filter(
      (player) => player.teamId === homeTeamId && matchPosition(player.position) === position
    );
    const away = participants.filter(
      (player) => player.teamId === awayTeamId && matchPosition(player.position) === position
    );
    const count = Math.max(home.length, away.length);
    return Array.from({ length: count }, (_, index) => ({
      key: `${position}-${index}`,
      position,
      home: home[index],
      away: away[index]
    }));
  });
}
export const statGroups: { title: string; stats: [MatchStatKey, string][] }[] = [
  {
    title: 'Combate',
    stats: [
      ['kills', 'Asesinatos'],
      ['deaths', 'Muertes'],
      ['assists', 'Asistencias'],
      ['damageToChampions', 'Daño a campeones'],
      ['damageTakenFromChampions', 'Daño recibido de campeones'],
      ['damageMitigated', 'Daño mitigado'],
      ['crowdControlTime', 'Control de adversarios'],
      ['doubleKills', 'Dobles'],
      ['tripleKills', 'Triples'],
      ['quadraKills', 'Cuádruples'],
      ['pentaKills', 'Pentakills'],
      ['largestKillingSpree', 'Mayor racha'],
      ['largestAbilityDamage', 'Mayor daño de habilidad'],
      ['largestAttackDamage', 'Mayor daño de ataque'],
      ['largestCriticalStrike', 'Mayor crítico']
    ]
  },
  {
    title: 'Economía y visión',
    stats: [
      ['level', 'Nivel'],
      ['goldEarned', 'Oro obtenido'],
      ['cs', 'Súbditos (CS)'],
      ['visionScore', 'Puntuación de visión'],
      ['wardsPlaced', 'Guardianes colocados'],
      ['wardsDestroyed', 'Guardianes destruidos'],
      ['controlWardsPurchased', 'Guardianes de control comprados'],
      ['detectorWardsPlaced', 'Guardianes detectores colocados']
    ]
  },
  {
    title: 'Objetivos',
    stats: [
      ['turretsKilled', 'Torres destruidas'],
      ['turretTakedowns', 'Participación en torres'],
      ['inhibitorsKilled', 'Inhibidores destruidos'],
      ['inhibitorTakedowns', 'Participación en inhibidores'],
      ['dragonsKilled', 'Dragones'],
      ['baronsKilled', 'Barones'],
      ['riftHeraldsKilled', 'Heraldos'],
      ['voidGrubsKilled', 'Larvas del Vacío'],
      ['elderDragonsKilled', 'Dragones ancianos'],
      ['objectivesStolen', 'Objetivos robados'],
      ['objectivesStolenAssists', 'Asistencias en robos']
    ]
  },
  {
    title: 'Actividad',
    stats: [
      ['summonerSpell1Casts', 'Usos de hechizo 1'],
      ['summonerSpell2Casts', 'Usos de hechizo 2'],
      ['pings', 'Señales'],
      ['longestTimeLiving', 'Mayor tiempo con vida'],
      ['timeSpentDead', 'Tiempo muerto']
    ]
  }
];
export function statNumber(value: number | null | undefined) {
  return value == null ? '—' : value.toLocaleString('es-ES');
}
export function formatMatchStat(key: MatchStatKey, value: number | null | undefined) {
  if (value == null) return '—';
  if (['longestTimeLiving', 'timeSpentDead', 'crowdControlTime'].includes(key)) {
    const seconds = Math.max(0, Math.floor(value));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  return statNumber(value);
}
