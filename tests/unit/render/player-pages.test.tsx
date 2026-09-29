import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from '../../../apps/web/src/App.js';
import type { PlayerDetail } from '../../../apps/web/src/features/competition/types/competition.types.js';
import { PlayerProfile } from '../../../apps/web/src/site/pages/player-details/PlayerDetailPage.js';
import { PlayerGrid, filterPlayers } from '../../../apps/web/src/site/pages/players/PlayersPage.js';
import { TeamProfile } from '../../../apps/web/src/site/pages/team-details/TeamDetailPage.js';

const player: PlayerDetail = {
  slug: 'jugador-uno-euw',
  id: '40000000-0000-4000-8000-000000000001',
  gameName: 'Jugador Uno',
  riotTag: 'EUW',
  countryCode: 'es',
  isMain: true,
  displayName: 'Nombre público',
  teams: [
    {
      id: 'team-1',
      slug: 'lobos',
      name: 'Lobos',
      shortName: 'LOB',
      logoUrl: null,
      seasonName: 'Temporada 1',
      divisionName: 'Premier',
      role: 'mid',
      isCaptain: true,
      isActive: true
    }
  ]
};

test('normalizes roster display names without changing source data, Riot IDs or links', () => {
  const member = Object.freeze({
    id: 'coach-1',
    playerId: player.id,
    playerSlug: player.slug,
    name: '𝑶𝒛𝒂𝒓𝒖',
    role: 'coach' as const,
    isCaptain: false,
    gameName: '𝑶zaru',
    riotTag: 'UZA',
    countryCode: null
  });
  const html = renderToStaticMarkup(
    <TeamProfile
      team={{
        id: 'team-1',
        name: 'Lobos',
        shortName: null,
        logoUrl: null,
        seasonName: 'T1',
        divisionName: 'Premier',
        isActive: true,
        members: [member]
      }}
    />
  );
  expect(html).toContain('>Ozaru</a>');
  expect(html).toContain('<p>Ozaru</p>');
  expect(html).toContain(
    `https://op.gg/es/lol/summoners/euw/${encodeURIComponent(member.gameName)}-UZA`
  );
  expect(html).toContain(`href="/jugadores/${player.slug}"`);
  expect(member.name).toBe('𝑶𝒛𝒂𝒓𝒖');
  expect(member.gameName).toBe('𝑶zaru');
  expect(member.riotTag).toBe('UZA');
  const profile = renderToStaticMarkup(
    <PlayerProfile player={{ ...player, displayName: member.name }} />
  );
  expect(profile).toContain('>Ozaru</p>');
  expect(profile).toContain('>Ozaru</dd>');
});

test('Player cards link to individual profiles and search matches names and Riot IDs', () => {
  const rosterPlayer = {
    ...player,
    competition: {
      role: 'mid',
      team: null,
      champion: null,
      stats: null,
      mvpMatchIds: [],
      featured: null
    }
  };
  const html = renderToStaticMarkup(<PlayerGrid players={[rosterPlayer]} />);
  expect(html).toContain('href="/jugadores/jugador-uno-euw"');
  expect(html).toContain('Jugador Uno');
  expect(filterPlayers([rosterPlayer], '  jugador uno#euw  ')).toHaveLength(1);
  expect(filterPlayers([rosterPlayer], 'PÚBLICO')).toHaveLength(1);
  expect(filterPlayers([rosterPlayer], 'missing')).toHaveLength(0);
  expect(renderToStaticMarkup(<PlayerGrid players={[]} />)).toContain(
    'No hay jugadores que coincidan'
  );
});

test('Player profiles show real membership context and handle missing data', () => {
  const html = renderToStaticMarkup(<PlayerProfile player={player} />);
  for (const text of [
    'Jugador Uno#EUW',
    'Cuenta principal',
    'Premier',
    'Temporada 1',
    'Mid',
    'Capitán',
    'href="/equipos/lobos"'
  ])
    expect(html).toContain(text);
  const empty = renderToStaticMarkup(
    <PlayerProfile
      player={{ ...player, teams: [], displayName: null, countryCode: null, riotTag: null }}
    />
  );
  expect(empty).toContain('Sin cuenta vinculada');
  expect(empty).toContain('todavía no tiene inscripciones');
});

test('Player direct links and trailing slashes render their own page with selected navigation', () => {
  for (const reference of [player.id, 'jugador-uno-euw', 'jugador-uno-euw/']) {
    const html = renderToStaticMarkup(<App initialPath={`/jugadores/${reference}`} />);
    expect(html).toContain('id="jugador"');
    expect(html).toContain('Cargando jugador');
    expect(html).not.toContain('Página no encontrada');
    expect(
      (html.match(/<a\b[^>]*>/g) ?? []).some(
        (tag) => tag.includes('href="/jugadores"') && tag.includes('aria-current="page"')
      )
    ).toBe(true);
  }
});

test('Player profiles display competition metrics and distinguish missing results', () => {
  const html = renderToStaticMarkup(
    <PlayerProfile
      player={{
        ...player,
        competition: {
          role: 'mid',
          team: player.teams[0] ?? defaultTeam,
          champion: 'Ahri',
          mvpMatchIds: ['m1', 'm2'],
          featured: null,
          stats: {
            games: 8,
            kda: 4.5,
            winRate: 75,
            csPerMinute: 7.2,
            killParticipation: 62,
            damagePerMinute: 600,
            visionScore: null,
            damageMitigated: null
          }
        }
      }}
    />
  );
  expect(html).toContain('75%');
  expect(html).toContain('4,5');
  expect(html).toContain('Campeón más jugado');
  expect(html).toContain('Ahri');
  expect(html).toContain('https://op.gg/es/lol/summoners/euw/Jugador%20Uno-EUW');
  const empty = renderToStaticMarkup(<PlayerProfile player={player} />);
  expect(empty).toContain('Las estadísticas aparecerán');
  expect(empty).not.toContain('player-performance-grid');
});

test('Team rosters link to the selected game account profile', () => {
  const html = renderToStaticMarkup(
    <TeamProfile
      team={{
        id: 'team-1',
        name: 'Lobos',
        shortName: null,
        logoUrl: null,
        seasonName: 'T1',
        divisionName: 'Premier',
        isActive: true,
        members: [
          {
            id: 'member-1',
            playerId: player.id,
            playerSlug: player.slug,
            name: 'Nombre',
            role: 'mid',
            isCaptain: true,
            gameName: player.gameName,
            riotTag: player.riotTag,
            countryCode: null
          }
        ]
      }}
    />
  );
  expect(html).toContain('href="/jugadores/jugador-uno-euw"');
});
