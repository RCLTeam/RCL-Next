import { expect, test } from 'vitest';
import { resolveTeamLogo } from '../../apps/web/src/shared/resources/team-logos.js';

test('resolves stored legacy logos to their new public location', () => {
  expect(resolveTeamLogo('/src/shared/assets/teams_logo/AKL.webp')).toBe(
    '/images/teams_logo/AKL.webp'
  );
  expect(resolveTeamLogo('/images/teams_logo/AKL.webp')).toBe('/images/teams_logo/AKL.webp');
});

test('preserves external logos and rejects unsafe URLs', () => {
  expect(resolveTeamLogo('https://example.com/logo.webp')).toBe('https://example.com/logo.webp');
  expect(resolveTeamLogo('javascript:alert(1)')).toBeUndefined();
  expect(resolveTeamLogo(null)).toBeUndefined();
});
