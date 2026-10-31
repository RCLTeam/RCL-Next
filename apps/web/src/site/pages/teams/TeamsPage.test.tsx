import { expect, test } from 'vitest';
import { filterTeams } from './TeamsPage.js';

const teams = [
  { name: 'Rebel Crown', shortName: 'RCL' },
  { name: 'Away Side', shortName: null }
];

test('Team search matches the name or the abbreviation', () => {
  expect(filterTeams(teams, ' rebel ').map((team) => team.name)).toEqual(['Rebel Crown']);
  expect(filterTeams(teams, 'rcl').map((team) => team.name)).toEqual(['Rebel Crown']);
  expect(filterTeams(teams, 'away').map((team) => team.name)).toEqual(['Away Side']);
  expect(filterTeams(teams, 'missing')).toEqual([]);
});
