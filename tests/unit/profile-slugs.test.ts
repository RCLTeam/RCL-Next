import { expect, test } from 'vitest';
import {
  profileSlugs,
  resolveProfileId,
  slugify
} from '../../apps/api/src/modules/competition/profile-slugs.js';

test('Profile names become readable paths with accents, punctuation and tags normalized', () => {
  expect(slugify('  Fénix / Élite!  ')).toBe('fenix-elite');
  expect(slugify('Jugador Uno#EUW')).toBe('jugador-uno-euw');
  expect(slugify('選手 JP')).toBe('選手-jp');
  expect(profileSlugs([{ id: 'a', name: '!!!' }], 'equipo').get('a')).toBe('equipo');
});

test('Duplicate team names use season and division, independent of directory order', () => {
  const entries = [
    { id: 'a', name: 'Lobos', context: '2026 Premier' },
    { id: 'b', name: 'Lobos', context: '2025 Ascend' }
  ];
  const slugs = profileSlugs(entries, 'equipo');
  expect(slugs.get('a')).toBe('lobos-2026-premier');
  expect(slugs.get('b')).toBe('lobos-2025-ascend');
  expect(profileSlugs([...entries].reverse(), 'equipo')).toEqual(slugs);
});

test('Colliding normalized names have unique deterministic paths and ambiguous names do not resolve', () => {
  const entries = [
    { id: 'a', name: 'Fénix' },
    { id: 'b', name: 'Fenix' },
    { id: 'c', name: 'Fenix-ca978112' }
  ];
  const slugs = profileSlugs(entries, 'equipo');
  expect(new Set(slugs.values()).size).toBe(3);
  expect(resolveProfileId('fenix', slugs)).toBeUndefined();
  for (const [id, slug] of slugs) expect(resolveProfileId(slug, slugs)).toBe(id);
  expect(profileSlugs([...entries].reverse(), 'equipo')).toEqual(slugs);
});

test('Old UUID URLs continue resolving and UUID-shaped names cannot shadow them', () => {
  const id = '30000000-0000-4000-8000-000000000001';
  const slugs = profileSlugs(
    [
      { id, name: 'Lobos' },
      { id: 'other', name: id }
    ],
    'equipo'
  );
  expect(resolveProfileId(id, slugs)).toBe(id);
  expect(resolveProfileId('lobos', slugs)).toBe(id);
  expect(resolveProfileId(slugs.get('other') ?? '', slugs)).toBe('other');
});
