import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { createApp } from '../../apps/api/src/app.js';
import { PostgresCompetitionRepository } from '../../apps/api/src/modules/competition/postgres-competition.repository.js';
import * as schema from '../../packages/database/src/schema.js';

test('HTTP -> controller -> service -> real repository -> embedded PostgreSQL', async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
  });
  const seed = await readFile(
    new URL('../../packages/database/seed/demo.sql', import.meta.url),
    'utf8'
  );
  await client.transaction((tx) => tx.exec(seed));
  const app = createApp({
    repository: new PostgresCompetitionRepository(db),
    checkDatabase: async () => {
      await db.select().from(schema.seasons).limit(1);
    },
    corsOrigin: 'http://localhost:5173'
  });
  await request(app).get('/health/ready').expect(200);
  const seasons = await request(app).get('/api/v1/seasons').expect(200);
  assert.equal(seasons.body.data.length, 1);
  const divisions = await request(app)
    .get(`/api/v1/seasons/${encodeURIComponent(seasons.body.data[0].id)}/divisions`)
    .expect(200);
  assert.equal(divisions.body.data.length, 2);
  const divisionId = divisions.body.data[0].id as string;
  const standings = await request(app).get(`/api/v1/divisions/${divisionId}/standings`).expect(200);
  assert.equal(standings.body.data[0].team.name, 'Lobos DEMO');
  assert.equal(standings.body.data[0].wins, 1);
  assert.equal(standings.body.data[1].losses, 1);
  const calendar = await request(app).get(`/api/v1/divisions/${divisionId}/calendar`).expect(200);
  assert.equal(calendar.body.data.length, 2);
  assert.equal(calendar.body.data[0].round.name, 'Jornada 1');
  const ascend = await request(app)
    .get(`/api/v1/divisions/${divisions.body.data[1].id}/standings`)
    .expect(200);
  assert.equal(ascend.body.data[0].played, 0);
});
