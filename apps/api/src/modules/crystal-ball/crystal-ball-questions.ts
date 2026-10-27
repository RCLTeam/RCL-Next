import type { CrystalQuestion } from '@rcl/contracts';
import { durationOptions, goldOptions, pentakillOptions } from './crystal-ball-policy.js';

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
      `Campeon de ${division.name}`,
      'classification',
      'team',
      'manual',
      options,
      1,
      division.id
    );
  }
  for (const [id, label] of [
    ['undefeated', 'Equipo que llegara a la final sin perder ninguna serie'],
    ['surprise-team', 'Equipo revelacion de playoffs'],
    ['disappointing-team', 'Equipo decepcion de playoffs']
  ] as const)
    add(id, label, 'classification', 'team', 'manual', teams);
  for (const [id, label, mode] of [
    ['player-mvp', 'Jugador con mas MVP de mapa', 'automatic'],
    ['player-kills', 'Jugador con mas asesinatos en una sola partida', 'automatic'],
    ['player-assists', 'Jugador con mas asistencias en una sola partida', 'automatic'],
    ['player-deaths', 'Jugador con mas muertes en una sola partida', 'automatic'],
    ['player-champions', 'Jugador con mas campeones distintos utilizados', 'automatic'],
    ['best-play', 'Jugador que protagonizara la mejor jugada', 'manual'],
    ['surprise-player', 'Jugador revelacion de playoffs', 'manual'],
    ['disappointing-player', 'Jugador decepcion de playoffs', 'manual']
  ] as const)
    add(id, label, 'players', 'player', mode, players);
  for (const [id, label] of [
    ['champion-picks', 'Campeon mas elegido'],
    ['champion-best-winrate', 'Campeon con mejor winrate (minimo 3 partidas)'],
    ['champion-worst-winrate', 'Campeon con peor winrate (minimo 3 partidas)'],
    ['champion-kills', 'Campeon con mas asesinatos por partida'],
    ['champion-assists', 'Campeon con mas asistencias por partida'],
    ['champion-deaths', 'Campeon con mas muertes por partida'],
    ['champion-positions', 'Campeon en mas posiciones diferentes']
  ] as const)
    add(id, label, 'meta', 'champion', 'automatic');
  add(
    'gold-difference',
    'Mayor diferencia de oro final en una partida',
    'meta',
    'choice',
    'automatic',
    goldOptions
  );
  add('shortest-game', 'Partida mas corta', 'meta', 'duration', 'automatic', durationOptions);
  add('pentakills', 'Cantidad de pentakills', 'meta', 'choice', 'automatic', pentakillOptions);
  return questions;
}
