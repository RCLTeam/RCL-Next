import { COMPETITIVE_ROLES, NON_COMPETITIVE_ROLES } from '@rcl/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from '../../../apps/web/src/App.js';
import type { PlayerDetail } from '../../../apps/web/src/features/competition/types/competition.types.js';
import { PlayerProfile } from '../../../apps/web/src/site/pages/player-details/PlayerDetailPage.js';
import { PlayerGrid, filterPlayers } from '../../../apps/web/src/site/pages/players/PlayersPage.js';
import { TeamProfile } from '../../../apps/web/src/site/pages/team-details/TeamDetailPage.js';

const defaultTeam = {
  id: 'team-1',
  slug: 'lobos',
  name: 'Lobos',
  shortName: 'LOB',
  logoUrl: null,
  color: '#ff0000',
  seasonName: 'Temporada 1',
  divisionName: 'Premier',
  role: 'mid' as const,
  isCaptain: true,
  isActive: true
};

const player: PlayerDetail = {
  slug: 'jugador-uno-euw',
  id: '40000000-0000-4000-8000-000000000001',
  gameName: 'Jugador Uno',
  riotTag: 'EUW',
  countryCode: 'es',
  isMain: true,
  displayName: 'Nombre público',
  registrationTeam: defaultTeam,
  statisticsSeasonName: 'Temporada 1',
  teams: [defaultTeam]
};

test('Player profiles link secondary accounts and identify the main account', () => {
  const secondary = {
    ...player,
    id: 'secondary',
    slug: 'secondary-euw',
    gameName: 'Secondary',
    isMain: false
  };
  const mainHtml = renderToStaticMarkup(
    <PlayerProfile player={{ ...player, linkedAccounts: [secondary] }} />
  );
  expect(mainHtml).toContain('Cuentas secundarias');
  expect(mainHtml).toContain('Cuenta secundaria');
  expect(mainHtml).toContain('Secondary#EUW');
  expect(mainHtml).toContain('href="/jugadores/secondary-euw"');
  const secondaryHtml = renderToStaticMarkup(
    <PlayerProfile player={{ ...secondary, linkedAccounts: [player] }} />
  );
  expect(secondaryHtml).toContain('Cuenta principal');
  expect(secondaryHtml).toContain('href="/jugadores/jugador-uno-euw"');
  expect(
    renderToStaticMarkup(<PlayerProfile player={{ ...player, linkedAccounts: [] }} />)
  ).toContain('No hay otras cuentas vinculadas');
});

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
  expect(html).toContain(
    `https://op.gg/es/lol/summoners/euw/${encodeURIComponent(member.gameName)}-UZA`
  );
  expect(html).toContain(`href="/jugadores/${player.slug}"`);
  expect(member.name).toBe('𝑶𝒛𝒂𝒓𝒖');
  const profile = renderToStaticMarkup(
    <PlayerProfile player={{ ...player, displayName: member.name }} />
  );
  expect(profile).toContain('>Ozaru</p>');
  expect(profile).toContain('>Ozaru</dd>');
});

test('Player cards link to individual profiles and search matches names and Riot IDs', () => {
  const testPlayer: PlayerDetail = {
    ...player,
    gameName: 'Jugador Uno',
    riotTag: 'EUW',
    displayName: 'Nombre público',
    competition: {
      role: 'mid',
      team: null,
      champion: null,
      stats: null,
      mvpMatchIds: [],
      featured: null
    }
  };

  const html = renderToStaticMarkup(<PlayerGrid players={[testPlayer]} />);
  expect(html).toContain('href="/jugadores/jugador-uno-euw"');
  expect(html).toContain('Jugador Uno');
  expect(filterPlayers([testPlayer], '  jugador uno#euw  ')).toHaveLength(1);
  expect(filterPlayers([testPlayer], 'PÚBLICO')).toHaveLength(1);
  expect(filterPlayers([testPlayer], 'missing')).toHaveLength(0);
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
      player={{
        ...player,
        teams: [],
        registrationTeam: null,
        statisticsSeasonName: null,
        displayName: null,
        countryCode: null,
        riotTag: null
      }}
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

test('player profiles retain persisted MVP totals when match statistics are unavailable', () => {
  const html = renderToStaticMarkup(
    <PlayerProfile
      player={{
        ...player,
        competition: {
          role: 'mid',
          team: defaultTeam,
          stats: null,
          champion: null,
          mvpMatchIds: ['m1', 'm2'],
          featured: null
        }
      }}
    />
  );
  expect(html).toContain('<dt>MVPs</dt><dd>2</dd>');
  expect(html).toContain('<dt>KDA</dt><dd>—</dd>');
  expect(html).not.toContain('La historia está por escribir');
  expect(html).toContain('Estadísticas de partidas no disponibles');
});

test('profile header uses API registration for team, color, role and captaincy regardless of affiliations order', () => {
  const staffTeam = {
    ...defaultTeam,
    id: 'staff-team',
    slug: 'staff-team',
    name: 'Staff Team',
    role: 'staff' as const,
    color: '#00ff00',
    seasonName: 'Temporada staff'
  };
  const registrationTeam = { ...defaultTeam, isCaptain: false, role: 'substitute' as const };
  for (const teams of [
    [staffTeam, defaultTeam],
    [defaultTeam, staffTeam]
  ]) {
    const html = renderToStaticMarkup(
      <PlayerProfile player={{ ...player, teams, registrationTeam }} />
    );
    const header = html.split('</header>')[0] ?? '';
    expect(header).toContain('--profile-color:#ff0000');
    expect(header).toContain('href="/equipos/lobos"');
    expect(header).toContain('Última inscripción competitiva');
    expect(header).toContain('Suplente');
    expect(header).not.toContain('Staff Team');
    expect(header).not.toContain('Capitán');
    expect(html).toContain('Staff Team');
  }
});

test('a profile without competitive registration uses a neutral header and keeps historical awards and season', () => {
  const staff = { ...defaultTeam, role: 'coach' as const, seasonName: 'Temporada staff' };
  const html = renderToStaticMarkup(
    <PlayerProfile
      player={{
        ...player,
        registrationTeam: null,
        teams: [staff],
        statisticsSeasonName: 'Temporada histórica',
        competition: {
          team: null,
          role: null,
          champion: null,
          stats: null,
          mvpMatchIds: ['m1'],
          featured: null
        }
      }}
    />
  );
  const header = html.split('</header>')[0] ?? '';
  expect(header).toContain('--profile-color:var(--purple)');
  expect(header).toContain('Sin equipo competitivo');
  expect(header).not.toContain('Capitán');
  expect(header).not.toContain('href="/equipos/');
  const performance = html
    .split('aria-labelledby="player-performance-title"')[1]
    ?.split('</section>')[0];
  expect(performance).toContain('Temporada histórica');
  expect(performance).not.toContain('Temporada staff');
  expect(performance).toContain('<dt>MVPs</dt><dd>1</dd>');
});

test('inactive registration is identified without claiming a current team and empty stats are explicit', () => {
  const html = renderToStaticMarkup(
    <PlayerProfile
      player={{
        ...player,
        registrationTeam: { ...defaultTeam, isActive: false }
      }}
    />
  );
  const header = html.split('</header>')[0] ?? '';
  expect(header).toContain('Última inscripción competitiva');
  expect(header).toContain('Equipo inactivo');
  expect(header).not.toContain('Equipo actual');
  expect(html).toContain('Sin partidas registradas');
  expect(html).not.toContain('player-performance-grid');
});

test('missing optional API context never falls back to the first affiliation', () => {
  const {
    registrationTeam: _registration,
    statisticsSeasonName: _season,
    ...withoutContext
  } = player;
  const html = renderToStaticMarkup(<PlayerProfile player={withoutContext} />);
  const header = html.split('</header>')[0] ?? '';
  expect(header).toContain('Sin equipo competitivo');
  expect(header).not.toContain('href="/equipos/');
  const performance = html
    .split('aria-labelledby="player-performance-title"')[1]
    ?.split('</section>')[0];
  expect(performance).not.toContain('Temporada 1');
  expect(performance).toContain('No hay partidas ni premios registrados');
});

test('profile separates all competitive roles from other affiliations with independent counts', () => {
  const competitiveTeams = COMPETITIVE_ROLES.map((role, index) => ({
    ...defaultTeam,
    id: `competitive-${role}`,
    slug: `competitive-${role}`,
    name: `Competitive ${role}`,
    role,
    seasonName: `Season ${index}`,
    isActive: index === 0
  }));
  const otherTeams = NON_COMPETITIVE_ROLES.map((role) => ({
    ...defaultTeam,
    id: `other-${role}`,
    slug: `other-${role}`,
    name: `Other ${role}`,
    role,
    isCaptain: false
  }));
  const html = renderToStaticMarkup(
    <PlayerProfile
      player={{
        ...player,
        teams: [...otherTeams, ...competitiveTeams],
        registrationTeam: competitiveTeams[0] ?? null
      }}
    />
  );
  const competitive =
    html.split('aria-labelledby="player-competitive-teams-title"')[1]?.split('</section>')[0] ?? '';
  const other =
    html.split('aria-labelledby="player-other-teams-title"')[1]?.split('</section>')[0] ?? '';
  expect(html).toContain('<dt>Inscripciones competitivas</dt><dd>6</dd>');
  expect(html).toContain('<dt>Otras vinculaciones</dt><dd>3</dd>');
  expect(competitive).toContain('6 vinculaciones');
  expect(other).toContain('3 vinculaciones');
  for (const team of competitiveTeams) {
    expect(competitive).toContain(`href="/equipos/${team.slug}"`);
    expect(competitive).toContain(team.name);
    expect(competitive).toContain(team.seasonName);
    expect(competitive).toContain(team.divisionName);
    expect(other).not.toContain(team.name);
  }
  for (const team of otherTeams) {
    expect(other).toContain(`href="/equipos/${team.slug}"`);
    expect(other).toContain(team.name);
    expect(competitive).not.toContain(team.name);
  }
  expect(competitive).toContain('Equipo activo');
  expect(competitive).toContain('Equipo inactivo');
  expect(competitive.match(/Última inscripción competitiva/g)).toHaveLength(1);
  expect(other).not.toContain('Última inscripción competitiva');
  expect(html).not.toContain('Equipo actual');
});

test('staff-only profiles keep their affiliations without manufacturing a competitive trajectory', () => {
  const staffTeam = {
    ...defaultTeam,
    id: 'staff',
    name: 'Staff affiliation',
    role: 'staff' as const
  };
  const html = renderToStaticMarkup(
    <PlayerProfile
      player={{
        ...player,
        registrationTeam: null,
        teams: [staffTeam]
      }}
    />
  );
  const competitive = html
    .split('aria-labelledby="player-competitive-teams-title"')[1]
    ?.split('</section>')[0];
  const other = html.split('aria-labelledby="player-other-teams-title"')[1]?.split('</section>')[0];
  expect(competitive).toContain('no tiene inscripciones competitivas registradas');
  expect(competitive).not.toContain('player-profile-membership');
  expect(other).toContain('Staff affiliation');
  expect(other).toContain('1 vinculación');
  expect(html).toContain('<dt>Inscripciones competitivas</dt><dd>0</dd>');
});

test('empty affiliation categories have separate empty states and retain API order', () => {
  const empty = renderToStaticMarkup(
    <PlayerProfile player={{ ...player, registrationTeam: null, teams: [] }} />
  );
  expect(empty).toContain('no tiene inscripciones competitivas registradas');
  expect(empty).toContain('no tiene vinculaciones como coach, staff o partner');
  const older = {
    ...defaultTeam,
    id: 'older',
    name: 'Earlier registration',
    seasonName: 'Earlier season'
  };
  const teams = [defaultTeam, older];
  const html = renderToStaticMarkup(<PlayerProfile player={{ ...player, teams }} />);
  const competitive =
    html.split('aria-labelledby="player-competitive-teams-title"')[1]?.split('</section>')[0] ?? '';
  expect(competitive.indexOf('Lobos')).toBeLessThan(competitive.indexOf('Earlier registration'));
  expect(teams).toEqual([defaultTeam, older]);
  expect(html).toContain('no tiene vinculaciones como coach, staff o partner');
});
