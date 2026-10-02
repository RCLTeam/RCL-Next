import { expect, test } from 'vitest';
import { resolveTeamLogo } from '../../apps/web/src/shared/resources/team-logos.js';

test('resolves stored legacy and public logos to the managed API', () => {
  expect(resolveTeamLogo('/src/shared/assets/teams_logo/AKL.webp')).toBe(
    '/api/v1/team-logos/images/AKL.webp'
  );
  expect(resolveTeamLogo('/images/teams_logo/AKL.webp')).toBe('/api/v1/team-logos/images/AKL.webp');
});

test('preserves external logos and rejects unsafe URLs', () => {
  expect(resolveTeamLogo('https://example.com/logo.webp')).toBe('https://example.com/logo.webp');
  expect(resolveTeamLogo('javascript:alert(1)')).toBeUndefined();
  expect(resolveTeamLogo(null)).toBeUndefined();
});
