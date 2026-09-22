import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NavigationContext } from '../../../apps/web/src/shared/navigation.js';
import { SiteLayout } from '../../../apps/web/src/site/layout/SiteLayout.js';

describe('SiteLayout', () => {
  it('renders children, header, footer, and navigation', () => {
    const html = renderToString(
      <NavigationContext.Provider value={{ path: '/', navigate: () => {} }}>
        <SiteLayout>
          <div id="test-content">Hola Mundo</div>
        </SiteLayout>
      </NavigationContext.Provider>
    );

    expect(html).toContain('id="test-content"');
    expect(html).toContain('Hola Mundo');
    expect(html).toContain('class="site-header"');
    expect(html).toContain('class="site-footer"');
    expect(html).toContain('id="site-navigation"');
    expect(html).toContain('LA CORONA NO SE HEREDA, SE CONQUISTA');
  });

  it('renders season HUD with active match when live', () => {
    const mockCompetition = {
      season: { id: 's1', name: 'Temporada Invierno' },
      calendar: {
        data: [
          {
            id: 'm1',
            homeTeam: { id: 't1', name: 'Team Alpha', shortName: 'ALP', logoUrl: null },
            awayTeam: { id: 't2', name: 'Team Beta', shortName: 'BET', logoUrl: null },
            homeScore: 1,
            awayScore: 0,
            bestOf: 3,
            status: 'live' as const,
            scheduledAt: '2026-09-20T20:00:00Z',
            streamUrl: null,
            round: { id: 'r1', sequence: 1, stage: 'regular' as const, name: 'Jornada 1' }
          }
        ],
        status: 'ready' as const
      },
      seasons: { status: 'ready' as const, data: [] },
      divisions: { status: 'ready' as const, data: [] },
      division: undefined,
      teams: { status: 'ready' as const, data: [] },
      rounds: { status: 'ready' as const, data: [] },
      standings: { status: 'ready' as const, data: [] },
      selectedSeasonId: 's1',
      selectedDivisionId: 'd1',
      selectSeason: () => {},
      selectDivision: () => {},
      retry: () => {}
    };

    const html = renderToString(
      <NavigationContext.Provider value={{ path: '/', navigate: () => {} }}>
        <SiteLayout competition={mockCompetition}>
          <div>Content</div>
        </SiteLayout>
      </NavigationContext.Provider>
    );

    expect(html).toContain('EN DIRECTO · Team Alpha VS Team Beta');
    expect(html).toContain('Temporada Invierno');
    expect(html).toContain('class="is-live"');
  });

  it('renders navigation correctly without header switch', () => {
    const html = renderToString(
      <NavigationContext.Provider value={{ path: '/', navigate: () => {} }}>
        <SiteLayout>
          <div>Content</div>
        </SiteLayout>
      </NavigationContext.Provider>
    );

    expect(html).toContain('id="site-navigation"');
    expect(html).toContain('Inicio');
  });
  it('highlights current navigation link via aria-current', () => {
    const html = renderToString(
      <NavigationContext.Provider value={{ path: '/clasificacion', navigate: () => {} }}>
        <SiteLayout>
          <div>Content</div>
        </SiteLayout>
      </NavigationContext.Provider>
    );

    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/clasificacion"');
  });
});
