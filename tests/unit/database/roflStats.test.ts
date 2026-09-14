import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../../packages/database/src/schema.js';

const extraStats = [
  ['doubleKills', 'kda.double_kills'],
  ['tripleKills', 'kda.triple_kills'],
  ['quadraKills', 'kda.quadra_kills'],
  ['pentaKills', 'kda.penta_kills'],
  ['largestKillingSpree', 'kda.largest_killing_spree'],
  ['goldEarned', 'oro'],
  ['level', 'nivel'],
  ['damageTakenFromChampions', 'daño_recibido_campeones'],
  ['damageMitigated', 'soporte.daño_mitigado'],
  ['crowdControlTime', 'soporte.control_adversarios'],
  ['turretsKilled', 'estructuras.torres'],
  ['turretTakedowns', 'estructuras.derribos_torres'],
  ['inhibitorsKilled', 'estructuras.inhibidores'],
  ['inhibitorTakedowns', 'estructuras.derribos_inhibidores'],
  ['wardsPlaced', 'vision.wards_colocados'],
  ['wardsDestroyed', 'vision.wards_destruidos'],
  ['controlWardsPurchased', 'vision.pinkwards_comprados'],
  ['detectorWardsPlaced', 'vision.wards_detector'],
  ['pings', 'pings'],
  ['summonerSpell1Casts', 'hechizos.casts_1'],
  ['summonerSpell2Casts', 'hechizos.casts_2'],
  ['dragonsKilled', 'monstruos.dragones'],
  ['baronsKilled', 'monstruos.barones'],
  ['riftHeraldsKilled', 'monstruos.heraldos'],
  ['voidGrubsKilled', 'monstruos.void_grubs'],
  ['elderDragonsKilled', 'monstruos.elder_dragons'],
  ['objectivesStolen', 'monstruos.objetivos_robados'],
  ['objectivesStolenAssists', 'monstruos.asistencias_robo'],
  ['largestAbilityDamage', 'gameplay.mayor_daño_habilidad'],
  ['largestAttackDamage', 'gameplay.mayor_daño_ataque'],
  ['largestCriticalStrike', 'gameplay.mayor_critico'],
  ['longestTimeLiving', 'gameplay.tiempo_vivo_mas_largo'],
  ['timeSpentDead', 'gameplay.tiempo_muerto']
] as const;
function field(source: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined,
      source
    );
}
function number(source: unknown, path: string): number {
  const value = field(source, path);
  assert.ok(typeof value === 'number' && Number.isInteger(value) && value >= 0, path);
  return value;
}
function string(source: unknown, path: string): string {
  const value = field(source, path);
  assert.equal(typeof value, 'string', path);
  return String(value);
}

test('all ten ROFL JSON participants fit the normalized schema without losing metrics', async (t) => {
  const client = new PGlite();
  t.after(() => client.close());
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../../packages/database/drizzle', import.meta.url))
  });
  await client.transaction(async (tx) => {
    await tx.exec(
      await readFile(new URL('../../../packages/database/seed/demo.sql', import.meta.url), 'utf8')
    );
  });
  const document: unknown = JSON.parse(
    await readFile(
      new URL('../../../apps/parser/result/EUW1-7982902321_estadisticas.json', import.meta.url),
      'utf8'
    )
  );
  const participants = field(document, 'jugadores');
  assert.ok(Array.isArray(participants));
  assert.equal(participants.length, 10);

  for (let index = 0; index < participants.length; index++) {
    const participant: unknown = participants[index];
    const suffix = String(index + 1).padStart(12, '0');
    const id = `a0000000-0000-4000-8000-${suffix}`;
    const stats = {
      ...Object.fromEntries(
        extraStats.map(([column, path]) => [column, number(participant, path)])
      ),
      kills: number(participant, 'kda.kills'),
      deaths: number(participant, 'kda.muertes'),
      assists: number(participant, 'kda.asistencias'),
      cs: number(participant, 'cs'),
      damageToChampions: number(participant, 'daño_campeones'),
      visionScore: number(participant, 'vision.score')
    };
    const runes = {
      primaryKeystoneId: number(participant, 'runas.primaria.keystone_id'),
      primaryPerk: number(participant, 'runas.primaria.estilo_id'),
      primaryPerk1: number(participant, 'runas.primaria.runa_1_id'),
      primaryPerk2: number(participant, 'runas.primaria.runa_2_id'),
      primaryPerk3: number(participant, 'runas.primaria.runa_3_id'),
      secundaryRuneId: number(participant, 'runas.secundaria.estilo_id'),
      secundaryPerk1: number(participant, 'runas.secundaria.runa_1_id'),
      secundaryPerk2: number(participant, 'runas.secundaria.runa_2_id'),
      statPerkOffense: number(participant, 'runas.fragmentos.ofensiva_id'),
      statPerkFlex: number(participant, 'runas.fragmentos.flexible_id'),
      statPerkDefense: number(participant, 'runas.fragmentos.defensiva_id')
    };
    const slots = field(participant, 'objetos.slots');
    assert.ok(Array.isArray(slots));
    const slotMap = new Map(
      slots.map((slot: unknown) => [number(slot, 'slot'), number(slot, 'id')])
    );
    assert.equal(slotMap.size, 7);
    const build = {
      ...Object.fromEntries(
        Array.from({ length: 6 }, (_, slot) => [`item${slot}`, slotMap.get(slot)])
      ),
      trinket: slotMap.get(6),
      summonerSpell1Id: number(participant, 'hechizos.hechizo_1_id'),
      summonerSpell2Id: number(participant, 'hechizos.hechizo_2_id')
    };
    await db.transaction(async (tx) => {
      await tx
        .update(schema.players)
        .set({
          puuid: string(participant, 'puuid'),
          gameName: string(participant, 'nombre'),
          riotTag: string(participant, 'tag')
        })
        .where(eq(schema.players.id, `40000000-0000-4000-8000-${suffix}`));
      await tx
        .update(schema.playerGameInfo)
        .set({
          position: string(participant, 'posicion'),
          champion: string(participant, 'campeon')
        })
        .where(eq(schema.playerGameInfo.id, id));
      await tx.update(schema.playerGameStats).set(stats).where(eq(schema.playerGameStats.id, id));
      await tx.update(schema.playerGameRunes).set(runes).where(eq(schema.playerGameRunes.id, id));
      await tx.update(schema.playerGameBuild).set(build).where(eq(schema.playerGameBuild.id, id));
    });
    for (const [table, expected] of [
      [schema.playerGameStats, stats],
      [schema.playerGameRunes, runes],
      [schema.playerGameBuild, build]
    ] as const) {
      const [stored] = await db.select().from(table).where(eq(table.id, id));
      assert.ok(stored);
      const values = new Map(Object.entries(stored));
      for (const [key, value] of Object.entries(expected))
        assert.equal(values.get(key), value, key);
    }
    const [player] = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.id, `40000000-0000-4000-8000-${suffix}`));
    assert.equal(player?.puuid, string(participant, 'puuid'));
    const [info] = await db
      .select()
      .from(schema.playerGameInfo)
      .where(eq(schema.playerGameInfo.id, id));
    assert.equal(info?.position, string(participant, 'posicion'));
  }

  await t.test('all added statistics reject negatives', async () => {
    for (const [key] of extraStats) {
      await assert.rejects(db.update(schema.playerGameStats).set({ [key]: -1 }));
    }
  });
  await t.test('absent metrics stay NULL while explicit zero is retained', async () => {
    const id = 'a0000000-0000-4000-8000-000000000001';
    await db
      .update(schema.playerGameStats)
      .set({ goldEarned: null, pentaKills: 0 })
      .where(eq(schema.playerGameStats.id, id));
    const [row] = await db
      .select()
      .from(schema.playerGameStats)
      .where(eq(schema.playerGameStats.id, id));
    assert.equal(row?.goldEarned, null);
    assert.equal(row?.pentaKills, 0);
  });
});
