import type { CrystalQuestion } from '@rcl/contracts';
import { durationOptions } from './crystal-ball-policy.js';

type Option = { id: string; name: string };
export function crystalQuestions(
  divisions: Option[],
  teams: (Option & { divisionId: string })[],
  players: Option[]
): CrystalQuestion[] {
  const questions: CrystalQuestion[] = [];
  const add = (
    id: string,
    label: string,
    category: CrystalQuestion['category'],
    kind: CrystalQuestion['kind'],
    mode: CrystalQuestion['mode'],
    options: Option[] = [],
    count = 1,
    divisionId?: string
  ) => {
    questions.push({
      id,
      label,
      category,
      kind,
      mode,
      count,
      options,
      ...(divisionId ? { divisionId } : {})
    });
  };
  for (const division of divisions) {
    const options = teams.filter((team) => team.divisionId === division.id);
    add(
      `winner:${division.id}`,
      `${division.name} · Winner bracket`,
      'qualification',
      'team',
      'manual',
      options,
      4,
      division.id
    );
    add(
      `loser:${division.id}`,
      `${division.name} · Loser bracket`,
      'qualification',
      'team',
      'manual',
      options,
      2,
      division.id
    );
    add(
      `champion:${division.id}`,
      `Campeón de ${division.name}`,
      'classification',
      'team',
      'manual',
      options,
      1,
      division.id
    );
  }
  for (const [id, label] of [
    ['undefeated', 'Equipo que llegará a la final sin perder ninguna serie'],
    ['surprise-team', 'Equipo revelación de playoffs'],
    ['disappointing-team', 'Equipo decepción de playoffs']
  ] as const)
    add(id, label, 'classification', 'team', 'manual', teams);
  for (const [id, label, mode] of [
    ['player-mvp', 'Jugador con más MVP de mapa', 'automatic'],
    ['player-kills', 'Jugador con más asesinatos en una sola partida', 'automatic'],
    ['player-assists', 'Jugador con más asistencias en una sola partida', 'automatic'],
    ['player-deaths', 'Jugador con más muertes en una sola partida', 'automatic'],
    ['player-champions', 'Jugador con más campeones distintos utilizados', 'automatic'],
    ['best-play', 'Jugador que protagonizará la mejor jugada', 'manual'],
    ['surprise-player', 'Jugador revelación de playoffs', 'manual'],
    ['disappointing-player', 'Jugador decepción de playoffs', 'manual']
  ] as const)
    add(id, label, 'players', 'player', mode, players);
  for (const [id, label] of [
    ['champion-picks', 'Campeón más elegido'],
    ['champion-best-winrate', 'Campeón con mejor winrate (mínimo 3 partidas)'],
    ['champion-worst-winrate', 'Campeón con peor winrate (mínimo 3 partidas)'],
    ['champion-kills', 'Campeón con más asesinatos por partida'],
    ['champion-assists', 'Campeón con más asistencias por partida'],
    ['champion-deaths', 'Campeón con más muertes por partida'],
    ['champion-positions', 'Campeón en más posiciones diferentes']
  ] as const)
    add(id, label, 'meta', 'champion', 'automatic');
  add(
    'gold-difference',
    'Mayor diferencia de oro final en una partida',
    'meta',
    'integer',
    'automatic'
  );
  add('shortest-game', 'Partida más corta', 'meta', 'duration', 'automatic', durationOptions);
  add('pentakills', 'Cantidad de pentakills', 'meta', 'integer', 'automatic');
  return questions;
}
