import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NavigationContext } from '../../shared/navigation.js';
import { SiteLayout } from './SiteLayout.js';

describe('SiteLayout footer suggestions button', () => {
  it('renders footer contacts section containing the Sugerencias button', () => {
    const html = renderToString(
      <NavigationContext.Provider value={{ path: '/', navigate: () => {} }}>
        <SiteLayout>
          <div>Test Page Content</div>
        </SiteLayout>
      </NavigationContext.Provider>
    );

    expect(html).toContain('<h2>Contactos</h2>');
    expect(html).toContain('footer-suggestion-btn');
    expect(html).toContain('Sugerencias');
  });
});
