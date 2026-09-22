// Synchronized with drizzle migrations. SQL triggers remain in the baseline migration.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

export const appRole = pgEnum('app_role', ['viewer', 'admin', 'owner']);
export const gameSide = pgEnum('game_side', ['blue', 'red']);
export const stage = pgEnum('stage', ['regular', 'playoff']);
export const matchStatus = pgEnum('match_status', [
  'scheduled',
  'live',
  'completed',
  'cancelled',
  'forfeit'
]);
export const rosterRole = pgEnum('roster_role', [
  'top',
  'jungle',
  'mid',
  'adc',
  'support',
  'substitute',
  'coach',
  'staff',
  'partners'
]);
export const rosterMovementAction = pgEnum('roster_movement_action', [
  'joined',
  'left',
  'promoted_to_captain',
  'demoted_from_captain',
  'role_changed'
]);

export const discordUsers = pgTable('discord_users', {
  discordId: varchar('discord_id', { length: 32 }).primaryKey(),
  username: varchar('username', { length: 64 }).notNull(),
  globalName: varchar('global_name', { length: 64 }),
  avatarHash: varchar('avatar_hash', { length: 128 }),
  role: appRole('role').notNull().default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    discordUserId: varchar('discord_user_id', { length: 32 })
      .notNull()
      .references(() => discordUsers.discordId, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index('auth_sessions_expires_at_idx').on(t.expiresAt)]
);

export const oauthStates = pgTable(
  'oauth_states',
  {
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
  },
  (t) => [index('oauth_states_expires_at_idx').on(t.expiresAt)]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorDiscordUserId: varchar('actor_discord_user_id', { length: 32 }),
    action: varchar('action', { length: 120 }).notNull(),
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'audit_logs_actor_discord_user_id_fkey',
      columns: [t.actorDiscordUserId],
      foreignColumns: [discordUsers.discordId]
    }).onDelete('set null'),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_actor_discord_user_id_idx').on(t.actorDiscordUserId)
  ]
);

export const seasons = pgTable(
  'seasons',
  {
    name: varchar('name', { length: 120 }).primaryKey(),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check(
      'seasons_dates_check',
      sql`"ends_on" IS NULL OR "starts_on" IS NULL OR "ends_on" >= "starts_on"`
    )
  ]
);

export const divisions = pgTable('divisions', {
  name: varchar('name', { length: 80 }).primaryKey(),
  sortOrder: smallint('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const seasonsDivisions = pgTable(
  'seasons_divisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonName: varchar('season_name', { length: 120 }).notNull(),
    divisionName: varchar('division_name', { length: 80 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'seasons_divisions_season_name_fkey',
      columns: [t.seasonName],
      foreignColumns: [seasons.name]
    }).onDelete('cascade'),
    foreignKey({
      name: 'seasons_divisions_division_name_fkey',
      columns: [t.divisionName],
      foreignColumns: [divisions.name]
    }).onDelete('cascade'),
    unique('seasons_divisions_season_division_key').on(t.seasonName, t.divisionName),
    index('seasons_divisions_season_name_idx').on(t.seasonName),
    index('seasons_divisions_division_name_idx').on(t.divisionName)
  ]
);

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    discordUserId: varchar('discord_user_id', { length: 32 }),
    gameName: varchar('game_name', { length: 64 }).notNull(),
    riotTag: varchar('riot_tag', { length: 16 }),
    puuid: varchar('puuid', { length: 128 }),
    countryCode: varchar('country_code', { length: 2 }),
    isMain: boolean('is_main').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'players_discord_user_id_fkey',
      columns: [t.discordUserId],
      foreignColumns: [discordUsers.discordId]
    }).onDelete('set null'),
    unique('players_game_name_riot_tag_key').on(t.gameName, t.riotTag),
    index('players_discord_user_id_idx').on(t.discordUserId)
  ]
);

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonDivisionId: uuid('season_division_id').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    shortName: varchar('short_name', { length: 16 }),
    logoUrl: text('logo_url'),
    color: varchar('color', { length: 7 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'teams_season_division_id_fkey',
      columns: [t.seasonDivisionId],
      foreignColumns: [seasonsDivisions.id]
    }).onDelete('cascade'),
    unique('teams_season_division_name_key').on(t.seasonDivisionId, t.name),
    index('teams_season_division_id_idx').on(t.seasonDivisionId)
  ]
);

export const teamMemberships = pgTable(
  'team_memberships',
  {
    teamId: uuid('team_id').notNull(),
    discordUserId: varchar('discord_user_id', { length: 32 }).notNull(),
    role: rosterRole('role').notNull(),
    isCaptain: boolean('is_captain').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'team_memberships_team_id_fkey',
      columns: [t.teamId],
      foreignColumns: [teams.id]
    }).onDelete('cascade'),
    foreignKey({
      name: 'team_memberships_discord_user_id_fkey',
      columns: [t.discordUserId],
      foreignColumns: [discordUsers.discordId]
    }).onDelete('cascade'),
    primaryKey({ name: 'team_memberships_pkey', columns: [t.teamId, t.discordUserId] }),
    check(
      'team_memberships_captain_role_check',
      sql`"is_captain" = false OR "role" IN ('top', 'jungle', 'mid', 'adc', 'support')`
    ),
    index('team_memberships_team_id_idx').on(t.teamId),
    index('team_memberships_discord_user_id_idx').on(t.discordUserId),
    uniqueIndex('team_memberships_unique_captain')
      .on(t.teamId)
      .where(sql`"team_memberships"."is_captain" = true`)
  ]
);

export const rosterMovements = pgTable(
  'roster_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id').notNull(),
    discordUserId: varchar('discord_user_id', { length: 32 }).notNull(),
    action: rosterMovementAction('action').notNull(),
    role: rosterRole('role'),
    actorId: varchar('actor_id', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'roster_movements_team_id_fkey',
      columns: [t.teamId],
      foreignColumns: [teams.id]
    }).onDelete('cascade'),
    foreignKey({
      name: 'roster_movements_discord_user_id_fkey',
      columns: [t.discordUserId],
      foreignColumns: [discordUsers.discordId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'roster_movements_actor_id_fkey',
      columns: [t.actorId],
      foreignColumns: [discordUsers.discordId]
    }).onDelete('set null'),
    index('roster_movements_team_id_idx').on(t.teamId),
    index('roster_movements_discord_user_id_idx').on(t.discordUserId),
    index('roster_movements_actor_id_idx').on(t.actorId),
    index('roster_movements_created_at_idx').on(t.createdAt)
  ]
);

export const rounds = pgTable(
  'rounds',
  {
    id: smallint('id').notNull(),
    idSeasonDivision: uuid('id_season_division').notNull(),
    stage: stage('stage').notNull().default('regular'),
    name: varchar('name', { length: 120 }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'rounds_id_season_division_fkey',
      columns: [t.idSeasonDivision],
      foreignColumns: [seasonsDivisions.id]
    }).onDelete('cascade'),
    primaryKey({ name: 'rounds_pkey', columns: [t.id, t.idSeasonDivision] }),
    index('rounds_season_division_idx').on(t.idSeasonDivision)
  ]
);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idSeasonDivision: uuid('id_season_division').notNull(),
    idRound: smallint('id_round'),
    team1Id: uuid('team1_id').notNull(),
    team2Id: uuid('team2_id').notNull(),
    bestOf: smallint('best_of').notNull().default(1),
    status: matchStatus('status').notNull().default('scheduled'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    winnerTeamId: uuid('winner_team_id'),
    team1Score: smallint('team1_score').notNull().default(0),
    team2Score: smallint('team2_score').notNull().default(0),
    streamUrl: text('stream_url'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'matches_id_season_division_fkey',
      columns: [t.idSeasonDivision],
      foreignColumns: [seasonsDivisions.id]
    }).onDelete('cascade'),
    foreignKey({
      name: 'matches_team1_id_fkey',
      columns: [t.team1Id],
      foreignColumns: [teams.id]
    }).onDelete('cascade'),
    foreignKey({
      name: 'matches_team2_id_fkey',
      columns: [t.team2Id],
      foreignColumns: [teams.id]
    }).onDelete('cascade'),
    foreignKey({
      name: 'matches_winner_team_id_fkey',
      columns: [t.winnerTeamId],
      foreignColumns: [teams.id]
    }).onDelete('set null'),
    unique('matches_unique_combination').on(t.idSeasonDivision, t.idRound, t.team1Id, t.team2Id),
    check('matches_different_teams_check', sql`"team1_id" <> "team2_id"`),
    check('matches_best_of_check', sql`"best_of" IN (1, 3, 5)`),
    check('matches_scores_check', sql`"team1_score" >= 0 AND "team2_score" >= 0`),
    check(
      'matches_winner_participant_check',
      sql`"winner_team_id" IS NULL OR "winner_team_id" IN ("team1_id", "team2_id")`
    ),
    foreignKey({
      name: 'matches_round_fkey',
      columns: [t.idRound, t.idSeasonDivision],
      foreignColumns: [rounds.id, rounds.idSeasonDivision]
    }).onDelete('set null'),
    index('matches_season_division_scheduled_at_idx').on(t.idSeasonDivision, t.scheduledAt),
    index('matches_round_idx').on(t.idRound, t.idSeasonDivision),
    index('matches_team1_id_idx').on(t.team1Id),
    index('matches_team2_id_idx').on(t.team2Id)
  ]
);

export const matchGames = pgTable(
  'match_games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchesId: uuid('matches_id').notNull(),
    gameNumber: smallint('game_number').notNull(),
    blueTeamId: uuid('blue_team_id').notNull(),
    redTeamId: uuid('red_team_id').notNull(),
    winnerTeamId: uuid('winner_team_id'),
    durationSeconds: integer('duration_seconds'),
    externalGameId: varchar('external_game_id', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'match_games_matches_id_fkey',
      columns: [t.matchesId],
      foreignColumns: [matches.id]
    }).onDelete('cascade'),
    foreignKey({
      name: 'match_games_blue_team_id_fkey',
      columns: [t.blueTeamId],
      foreignColumns: [teams.id]
    }).onDelete('cascade'),
    foreignKey({
      name: 'match_games_red_team_id_fkey',
      columns: [t.redTeamId],
      foreignColumns: [teams.id]
    }).onDelete('cascade'),
    foreignKey({
      name: 'match_games_winner_team_id_fkey',
      columns: [t.winnerTeamId],
      foreignColumns: [teams.id]
    }).onDelete('cascade'),
    unique('match_games_matches_id_game_number_unique').on(t.matchesId, t.gameNumber),
    unique('match_games_external_game_id_key').on(t.externalGameId),
    check('match_games_different_teams_check', sql`"blue_team_id" <> "red_team_id"`),
    check('match_games_number_check', sql`"game_number" > 0`),
    check('match_games_duration_check', sql`"duration_seconds" IS NULL OR "duration_seconds" > 0`),
    check(
      'match_games_winner_participant_check',
      sql`"winner_team_id" IS NULL OR "winner_team_id" IN ("blue_team_id", "red_team_id")`
    ),
    index('match_games_matches_id_idx').on(t.matchesId),
    index('match_games_blue_team_id_idx').on(t.blueTeamId),
    index('match_games_red_team_id_idx').on(t.redTeamId)
  ]
);

export const playerGameInfo = pgTable(
  'player_game_info',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchGameId: uuid('match_game_id').notNull(),
    playerId: uuid('player_id').notNull(),
    teamId: uuid('team_id').notNull(),
    side: gameSide('side').notNull(),
    champion: varchar('champion', { length: 64 }).notNull(),
    position: varchar('position', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'player_game_info_match_game_id_fkey',
      columns: [t.matchGameId],
      foreignColumns: [matchGames.id]
    }).onDelete('cascade'),
    foreignKey({
      name: 'player_game_info_player_id_fkey',
      columns: [t.playerId],
      foreignColumns: [players.id]
    }).onDelete('restrict'),
    foreignKey({
      name: 'player_game_info_team_id_fkey',
      columns: [t.teamId],
      foreignColumns: [teams.id]
    }).onDelete('restrict'),
    unique('player_game_info_match_game_player_key').on(t.matchGameId, t.playerId),
    index('player_game_info_match_game_id_idx').on(t.matchGameId),
    index('player_game_info_player_id_idx').on(t.playerId),
    index('player_game_info_team_id_idx').on(t.teamId)
  ]
);

export const playerGameBuild = pgTable(
  'player_game_build',
  {
    id: uuid('id').primaryKey(),
    item0: integer('item_0').notNull().default(0),
    item1: integer('item_1').notNull().default(0),
    item2: integer('item_2').notNull().default(0),
    item3: integer('item_3').notNull().default(0),
    item4: integer('item_4').notNull().default(0),
    item5: integer('item_5').notNull().default(0),
    trinket: integer('trinket').notNull().default(0),
    summonerSpell1Id: integer('summoner_spell_1_id'),
    summonerSpell2Id: integer('summoner_spell_2_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'player_game_build_id_fkey',
      columns: [t.id],
      foreignColumns: [playerGameInfo.id]
    }).onDelete('cascade')
  ]
);

export const playerGameRunes = pgTable(
  'player_game_runes',
  {
    id: uuid('id').primaryKey(),
    primaryKeystoneId: integer('primary_keystone_id').notNull(),
    secundaryRuneId: integer('secundary_rune_id').notNull(),
    primaryPerk: integer('primary_perk').notNull(),
    primaryPerk1: integer('primary_perk_1').notNull(),
    primaryPerk2: integer('primary_perk_2').notNull(),
    primaryPerk3: integer('primary_perk_3').notNull(),
    secundaryPerk1: integer('secundary_perk_1').notNull(),
    secundaryPerk2: integer('secundary_perk_2').notNull(),
    statPerkOffense: integer('stat_perk_offense').notNull(),
    statPerkFlex: integer('stat_perk_flex').notNull(),
    statPerkDefense: integer('stat_perk_defense').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'player_game_runes_id_fkey',
      columns: [t.id],
      foreignColumns: [playerGameInfo.id]
    }).onDelete('cascade')
  ]
);

export const playerGameStats = pgTable(
  'player_game_stats',
  {
    id: uuid('id').primaryKey(),
    kills: smallint('kills').notNull().default(0),
    deaths: smallint('deaths').notNull().default(0),
    assists: smallint('assists').notNull().default(0),
    cs: smallint('cs').notNull().default(0),
    damageToChampions: integer('damage_to_champions').notNull().default(0),
    visionScore: integer('vision_score'),
    doubleKills: integer('double_kills'),
    tripleKills: integer('triple_kills'),
    quadraKills: integer('quadra_kills'),
    pentaKills: integer('penta_kills'),
    largestKillingSpree: integer('largest_killing_spree'),
    goldEarned: integer('gold_earned'),
    level: integer('level'),
    damageTakenFromChampions: integer('damage_taken_from_champions'),
    damageMitigated: integer('damage_mitigated'),
    crowdControlTime: integer('crowd_control_time'),
    turretsKilled: integer('turrets_killed'),
    turretTakedowns: integer('turret_takedowns'),
    inhibitorsKilled: integer('inhibitors_killed'),
    inhibitorTakedowns: integer('inhibitor_takedowns'),
    wardsPlaced: integer('wards_placed'),
    wardsDestroyed: integer('wards_destroyed'),
    controlWardsPurchased: integer('control_wards_purchased'),
    detectorWardsPlaced: integer('detector_wards_placed'),
    pings: integer('pings'),
    summonerSpell1Casts: integer('summoner_spell_1_casts'),
    summonerSpell2Casts: integer('summoner_spell_2_casts'),
    dragonsKilled: integer('dragons_killed'),
    baronsKilled: integer('barons_killed'),
    riftHeraldsKilled: integer('rift_heralds_killed'),
    voidGrubsKilled: integer('void_grubs_killed'),
    elderDragonsKilled: integer('elder_dragons_killed'),
    objectivesStolen: integer('objectives_stolen'),
    objectivesStolenAssists: integer('objectives_stolen_assists'),
    largestAbilityDamage: integer('largest_ability_damage'),
    largestAttackDamage: integer('largest_attack_damage'),
    largestCriticalStrike: integer('largest_critical_strike'),
    longestTimeLiving: integer('longest_time_living'),
    timeSpentDead: integer('time_spent_dead'),
    isMvp: boolean('is_mvp').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'player_game_stats_id_fkey',
      columns: [t.id],
      foreignColumns: [playerGameInfo.id]
    }).onDelete('cascade'),
    check(
      'player_game_stats_non_negative_check',
      sql`"kills" >= 0 AND "deaths" >= 0 AND "assists" >= 0 AND "cs" >= 0 AND "damage_to_champions" >= 0`
    ),
    check('player_game_stats_vision_check', sql`"vision_score" IS NULL OR "vision_score" >= 0`),
    check(
      'player_game_stats_rofl_non_negative_check',
      sql`
    ("double_kills" IS NULL OR "double_kills" >= 0) AND
    ("triple_kills" IS NULL OR "triple_kills" >= 0) AND
    ("quadra_kills" IS NULL OR "quadra_kills" >= 0) AND
    ("penta_kills" IS NULL OR "penta_kills" >= 0) AND
    ("largest_killing_spree" IS NULL OR "largest_killing_spree" >= 0) AND
    ("gold_earned" IS NULL OR "gold_earned" >= 0) AND
    ("level" IS NULL OR "level" >= 0) AND
    ("damage_taken_from_champions" IS NULL OR "damage_taken_from_champions" >= 0) AND
    ("damage_mitigated" IS NULL OR "damage_mitigated" >= 0) AND
    ("crowd_control_time" IS NULL OR "crowd_control_time" >= 0) AND
    ("turrets_killed" IS NULL OR "turrets_killed" >= 0) AND
    ("turret_takedowns" IS NULL OR "turret_takedowns" >= 0) AND
    ("inhibitors_killed" IS NULL OR "inhibitors_killed" >= 0) AND
    ("inhibitor_takedowns" IS NULL OR "inhibitor_takedowns" >= 0) AND
    ("wards_placed" IS NULL OR "wards_placed" >= 0) AND
    ("wards_destroyed" IS NULL OR "wards_destroyed" >= 0) AND
    ("control_wards_purchased" IS NULL OR "control_wards_purchased" >= 0) AND
    ("detector_wards_placed" IS NULL OR "detector_wards_placed" >= 0) AND
    ("pings" IS NULL OR "pings" >= 0) AND
    ("summoner_spell_1_casts" IS NULL OR "summoner_spell_1_casts" >= 0) AND
    ("summoner_spell_2_casts" IS NULL OR "summoner_spell_2_casts" >= 0) AND
    ("dragons_killed" IS NULL OR "dragons_killed" >= 0) AND
    ("barons_killed" IS NULL OR "barons_killed" >= 0) AND
    ("rift_heralds_killed" IS NULL OR "rift_heralds_killed" >= 0) AND
    ("void_grubs_killed" IS NULL OR "void_grubs_killed" >= 0) AND
    ("elder_dragons_killed" IS NULL OR "elder_dragons_killed" >= 0) AND
    ("objectives_stolen" IS NULL OR "objectives_stolen" >= 0) AND
    ("objectives_stolen_assists" IS NULL OR "objectives_stolen_assists" >= 0) AND
    ("largest_ability_damage" IS NULL OR "largest_ability_damage" >= 0) AND
    ("largest_attack_damage" IS NULL OR "largest_attack_damage" >= 0) AND
    ("largest_critical_strike" IS NULL OR "largest_critical_strike" >= 0) AND
    ("longest_time_living" IS NULL OR "longest_time_living" >= 0) AND
    ("time_spent_dead" IS NULL OR "time_spent_dead" >= 0)
  `
    )
  ]
);

export const predictions = pgTable(
  'predictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    discordUserId: varchar('discord_user_id', { length: 32 }).notNull(),
    matchId: uuid('match_id').notNull(),
    selectedTeamId: uuid('selected_team_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    foreignKey({
      name: 'predictions_discord_user_id_fkey',
      columns: [t.discordUserId],
      foreignColumns: [discordUsers.discordId]
    }).onDelete('cascade'),
    foreignKey({
      name: 'predictions_match_id_fkey',
      columns: [t.matchId],
      foreignColumns: [matches.id]
    }).onDelete('cascade'),
    foreignKey({
      name: 'predictions_selected_team_id_fkey',
      columns: [t.selectedTeamId],
      foreignColumns: [teams.id]
    }).onDelete('restrict'),
    unique('predictions_user_match_key').on(t.discordUserId, t.matchId),
    index('predictions_match_id_idx').on(t.matchId),
    index('predictions_discord_user_id_idx').on(t.discordUserId)
  ]
);
