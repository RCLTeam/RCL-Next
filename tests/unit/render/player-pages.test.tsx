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

test('Player cards link to individual profiles and search matches names and Riot IDs', () => {
  const html = renderToStaticMarkup(<PlayerGrid players={[player]} />);
  expect(html).toContain('href="/jugadores/jugador-uno-euw"');
  expect(html).toContain('Jugador Uno');
  expect(filterPlayers([player], '  jugador uno#euw  ')).toHaveLength(1);
  expect(filterPlayers([player], 'PÚBLICO')).toHaveLength(1);
  expect(filterPlayers([player], 'missing')).toHaveLength(0);
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
  expect(empty).toContain('No disponible');
  expect(empty).toContain('todavía no tiene inscripciones');
});

test('Player direct links and trailing slashes render their own page with selected navigation', () => {
  for (const reference of [player.id, 'jugador-uno-euw', 'jugador-uno-euw/']) {
    const html = renderToStaticMarkup(<App initialPath={`/jugadores/${reference}`} />);
    expect(html).toContain('id="jugador"');
    expect(html).toContain('Cargando jugador');
    expect(html).toContain('Volver a jugadores');
    expect(html).not.toContain('Página no encontrada');
    expect(
      (html.match(/<a\b[^>]*>/g) ?? []).some(
        (tag) => tag.includes('href="/jugadores"') && tag.includes('aria-current="page"')
      )
    ).toBe(true);
  }
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
