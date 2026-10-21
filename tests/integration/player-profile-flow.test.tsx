import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import type { PlayerDetail } from '@rcl/contracts';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import request from 'supertest';
import { assert, expect, test } from 'vitest';
import { createApp } from '../../apps/api/src/app.js';
import { PostgresCompetitionRepository } from '../../apps/api/src/modules/competition/postgres-competition.repository.js';
import { PlayerProfile } from '../../apps/web/src/site/pages/player-details/PlayerDetailPage.js';
import * as schema from '../../packages/database/src/schema.js';

test('persisted affiliations flow through HTTP into the profile while historical statistics survive retirement', async (t) => {
  const client = new PGlite({ extensions: { btree_gist } });
  t.onTestFinished(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
  });
  await client.exec(await readFile('packages/database/seed/demo.sql', 'utf8'));
  const [player] = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.gameName, 'Jugador Demo 1'));
  assert.ok(player?.discordUserId);
  const app = createApp({
    repository: new PostgresCompetitionRepository(db),
    checkDatabase: async () => {},
    corsOrigin: 'http://localhost:5173'
  });
  const getProfile = async () => {
    const response = await request(app).get(`/api/v1/players/${player.id}`).expect(200);
    const detail = response.body.data as PlayerDetail;
    return { detail, html: renderToStaticMarkup(<PlayerProfile player={detail} />) };
  };
  const before = await getProfile();
  assert.ok(before.detail.registrationTeam);
  await db.insert(schema.teamMemberships).values({
    teamId: '30000000-0000-4000-8000-000000000002',
    discordUserId: player.discordUserId,
    seasonName: before.detail.registrationTeam.seasonName,
    role: 'coach',
    updatedAt: new Date('2099-01-01')
  });
  const mixed = await getProfile();
  expect(mixed.detail.teams[0]?.role).toBe('coach');
  expect(mixed.html.split('</header>')[0]).toBe(before.html.split('</header>')[0]);
  expect(mixed.html).toContain('<dt>Inscripciones competitivas</dt><dd>1</dd>');
  expect(mixed.html).toContain('<dt>Otras vinculaciones</dt><dd>1</dd>');
  await db
    .update(schema.teamMemberships)
    .set({ role: 'staff', isCaptain: false })
    .where(eq(schema.teamMemberships.discordUserId, player.discordUserId));
  const retired = await getProfile();
  expect(retired.detail.registrationTeam).toBeNull();
  expect(retired.detail.competition?.stats).toEqual(before.detail.competition?.stats);
  expect(retired.detail.statisticsSeasonName).toBe(before.detail.statisticsSeasonName);
  expect(retired.html.split('</header>')[0]).toContain('Sin equipo competitivo');
  expect(retired.html).toContain('player-performance-grid');
  expect(retired.html).toContain('<dt>Otras vinculaciones</dt><dd>2</dd>');
  expect(retired.html).toContain('no tiene inscripciones competitivas registradas');
});
