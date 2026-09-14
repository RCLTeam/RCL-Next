import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const appRole = pgEnum('app_role', ['viewer', 'admin']);
export const rosterRole = pgEnum('roster_role', ['top', 'jungle', 'mid', 'adc', 'support', 'substitute', 'coach', 'staff', 'partners']);
export const matchStatus = pgEnum('match_status', ['scheduled', 'live', 'completed', 'cancelled', 'forfeit']);
export const gameSide = pgEnum('game_side', ['blue', 'red']);
export const pickemQuestionType = pgEnum('pickem_question_type', ['team', 'player', 'text']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
};

export const seasons = pgTable('seasons', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
  isActive: boolean('is_active').notNull().default(false),
  ...timestamps
}, (table) => [
  uniqueIndex('seasons_one_active_key').on(table.isActive).where(sql`${table.isActive} = true`),
  check('seasons_dates_check', sql`${table.endsOn} IS NULL OR ${table.startsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}`)
]);

export const divisions = pgTable('divisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  seasonId: uuid('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 32 }).notNull(),
  name: varchar('name', { length: 80 }).notNull(),
  sortOrder: smallint('sort_order').notNull().default(0),
  ...timestamps
}, (table) => [unique('divisions_season_code_key').on(table.seasonId, table.code)]);

export const discordUsers = pgTable('discord_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  discordId: varchar('discord_id', { length: 32 }).notNull(),
  username: varchar('username', { length: 64 }).notNull(),
  globalName: varchar('global_name', { length: 64 }),
  avatarHash: varchar('avatar_hash', { length: 128 }),
  role: appRole('role').notNull().default('viewer'),
  ...timestamps
}, (table) => [uniqueIndex('discord_users_discord_id_key').on(table.discordId)]);

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  divisionId: uuid('division_id').notNull().references(() => divisions.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 120 }).notNull(),
  shortName: varchar('short_name', { length: 16 }),
  logoUrl: text('logo_url'),
  color: varchar('color', { length: 7 }),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps
}, (table) => [
  index('teams_division_id_idx').on(table.divisionId)
]);

export const players = pgTable('players', {
  id: uuid('id').defaultRandom().primaryKey(),
  discordUserId: uuid('discord_user_id').references(() => discordUsers.id, { onDelete: 'set null' }),
  gameName: varchar('game_name', { length: 64 }).notNull(),
  puuid: varchar('puuid', { length: 128 }),
  riotTag: varchar('riot_tag', { length: 16 }),
  countryCode: varchar('country_code', { length: 2 }),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps
}, (table) => [
  uniqueIndex('players_discord_user_id_key').on(table.discordUserId),
  uniqueIndex('players_puuid_key').on(table.puuid),
  index('players_riot_id_idx').on(table.gameName, table.riotTag)
]);

export const teamMemberships = pgTable('team_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull().references(() => players.id, { onDelete: 'restrict' }),
  role: rosterRole('role').notNull(),
  isCaptain: boolean('is_captain').notNull().default(false),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on'),
  ...timestamps
}, (table) => [
  index('team_memberships_team_id_idx').on(table.teamId),
  index('team_memberships_player_id_idx').on(table.playerId),
  check('team_memberships_dates_check', sql`${table.endsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}`)
]);

export const rounds = pgTable('rounds', {
  id: uuid('id').defaultRandom().primaryKey(),
  divisionId: uuid('division_id').notNull().references(() => divisions.id, { onDelete: 'cascade' }),
  sequence: smallint('sequence').notNull(),
  stage: varchar('stage', { length: 64 }).notNull().default('regular'),
  name: varchar('name', { length: 120 }),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  lockAt: timestamp('lock_at', { withTimezone: true }),
  ...timestamps
}, (table) => [
  unique('rounds_division_sequence_stage_key').on(table.divisionId, table.sequence, table.stage),
  index('rounds_division_id_idx').on(table.divisionId)
]);

export const matches = pgTable('matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  divisionId: uuid('division_id').notNull().references(() => divisions.id, { onDelete: 'restrict' }),
  roundId: uuid('round_id').references(() => rounds.id, { onDelete: 'set null' }),
  homeTeamId: uuid('home_team_id').notNull().references(() => teams.id, { onDelete: 'restrict' }),
  awayTeamId: uuid('away_team_id').notNull().references(() => teams.id, { onDelete: 'restrict' }),
  bestOf: smallint('best_of').notNull().default(1),
  status: matchStatus('status').notNull().default('scheduled'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  winnerTeamId: uuid('winner_team_id').references(() => teams.id, { onDelete: 'restrict' }),
  homeScore: smallint('home_score').notNull().default(0),
  awayScore: smallint('away_score').notNull().default(0),
  streamUrl: text('stream_url'),
  notes: text('notes'),
  ...timestamps
}, (table) => [
  index('matches_division_scheduled_at_idx').on(table.divisionId, table.scheduledAt),
  index('matches_round_id_idx').on(table.roundId),
  index('matches_home_team_id_idx').on(table.homeTeamId),
  index('matches_away_team_id_idx').on(table.awayTeamId),
  check('matches_different_teams_check', sql`${table.homeTeamId} <> ${table.awayTeamId}`),
  check('matches_best_of_check', sql`${table.bestOf} IN (1, 3, 5)`),
  check('matches_scores_check', sql`${table.homeScore} >= 0 AND ${table.awayScore} >= 0`)
]);

export const matchGames = pgTable('match_games', {
  id: uuid('id').defaultRandom().primaryKey(),
  matchId: uuid('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  gameNumber: smallint('game_number').notNull(),
  blueTeamId: uuid('blue_team_id').notNull().references(() => teams.id, { onDelete: 'restrict' }),
  redTeamId: uuid('red_team_id').notNull().references(() => teams.id, { onDelete: 'restrict' }),
  winnerTeamId: uuid('winner_team_id').references(() => teams.id, { onDelete: 'restrict' }),
  durationSeconds: integer('duration_seconds'),
  externalGameId: varchar('external_game_id', { length: 128 }),
  ...timestamps
}, (table) => [
  unique('match_games_match_game_number_key').on(table.matchId, table.gameNumber),
  uniqueIndex('match_games_external_game_id_key').on(table.externalGameId),
  index('match_games_match_id_idx').on(table.matchId),
  check('match_games_different_teams_check', sql`${table.blueTeamId} <> ${table.redTeamId}`),
  check('match_games_number_check', sql`${table.gameNumber} > 0`),
  check('match_games_duration_check', sql`${table.durationSeconds} IS NULL OR ${table.durationSeconds} > 0`)
]);

/** Parent participation. Children use this ID as both primary and foreign key. */
export const playerGameInfo = pgTable('player_game_info', {
  id: uuid('id').defaultRandom().primaryKey(),
  matchGameId: uuid('match_game_id').notNull().references(() => matchGames.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull().references(() => players.id, { onDelete: 'restrict' }),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'restrict' }),
  side: gameSide('side').notNull(),
  champion: varchar('champion', { length: 64 }).notNull(),
  // Preserve the position reported for this map, independent of roster role.
  position: varchar('position', { length: 64 }),
  ...timestamps
}, (t) => [
  unique('player_game_info_game_player_key').on(t.matchGameId, t.playerId),
  index('player_game_info_player_id_idx').on(t.playerId),
  index('player_game_info_team_id_idx').on(t.teamId)
]);

export const playerGameStats = pgTable('player_game_stats', {
  id: uuid('id').primaryKey().references(() => playerGameInfo.id, { onDelete: 'cascade' }),
  kills: smallint('kills').notNull().default(0),
  deaths: smallint('deaths').notNull().default(0),
  assists: smallint('assists').notNull().default(0),
  cs: smallint('cs').notNull().default(0),
  damageToChampions: integer('damage_to_champions').notNull().default(0),
  visionScore: integer('vision_score'),
  // NULL means not supplied. The parser's numeric zero is stored as zero.
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
  ...timestamps
}, (t) => [
  check('player_game_stats_non_negative_check', sql`${t.kills} >= 0 AND ${t.deaths} >= 0 AND ${t.assists} >= 0 AND ${t.cs} >= 0 AND ${t.damageToChampions} >= 0`),
  check('player_game_stats_vision_check', sql`${t.visionScore} IS NULL OR ${t.visionScore} >= 0`),
  check('player_game_stats_rofl_non_negative_check', sql`
    (${t.doubleKills} IS NULL OR ${t.doubleKills} >= 0) AND
    (${t.tripleKills} IS NULL OR ${t.tripleKills} >= 0) AND
    (${t.quadraKills} IS NULL OR ${t.quadraKills} >= 0) AND
    (${t.pentaKills} IS NULL OR ${t.pentaKills} >= 0) AND
    (${t.largestKillingSpree} IS NULL OR ${t.largestKillingSpree} >= 0) AND
    (${t.goldEarned} IS NULL OR ${t.goldEarned} >= 0) AND
    (${t.level} IS NULL OR ${t.level} >= 0) AND
    (${t.damageTakenFromChampions} IS NULL OR ${t.damageTakenFromChampions} >= 0) AND
    (${t.damageMitigated} IS NULL OR ${t.damageMitigated} >= 0) AND
    (${t.crowdControlTime} IS NULL OR ${t.crowdControlTime} >= 0) AND
    (${t.turretsKilled} IS NULL OR ${t.turretsKilled} >= 0) AND
    (${t.turretTakedowns} IS NULL OR ${t.turretTakedowns} >= 0) AND
    (${t.inhibitorsKilled} IS NULL OR ${t.inhibitorsKilled} >= 0) AND
    (${t.inhibitorTakedowns} IS NULL OR ${t.inhibitorTakedowns} >= 0) AND
    (${t.wardsPlaced} IS NULL OR ${t.wardsPlaced} >= 0) AND
    (${t.wardsDestroyed} IS NULL OR ${t.wardsDestroyed} >= 0) AND
    (${t.controlWardsPurchased} IS NULL OR ${t.controlWardsPurchased} >= 0) AND
    (${t.detectorWardsPlaced} IS NULL OR ${t.detectorWardsPlaced} >= 0) AND
    (${t.pings} IS NULL OR ${t.pings} >= 0) AND
    (${t.summonerSpell1Casts} IS NULL OR ${t.summonerSpell1Casts} >= 0) AND
    (${t.summonerSpell2Casts} IS NULL OR ${t.summonerSpell2Casts} >= 0) AND
    (${t.dragonsKilled} IS NULL OR ${t.dragonsKilled} >= 0) AND
    (${t.baronsKilled} IS NULL OR ${t.baronsKilled} >= 0) AND
    (${t.riftHeraldsKilled} IS NULL OR ${t.riftHeraldsKilled} >= 0) AND
    (${t.voidGrubsKilled} IS NULL OR ${t.voidGrubsKilled} >= 0) AND
    (${t.elderDragonsKilled} IS NULL OR ${t.elderDragonsKilled} >= 0) AND
    (${t.objectivesStolen} IS NULL OR ${t.objectivesStolen} >= 0) AND
    (${t.objectivesStolenAssists} IS NULL OR ${t.objectivesStolenAssists} >= 0) AND
    (${t.largestAbilityDamage} IS NULL OR ${t.largestAbilityDamage} >= 0) AND
    (${t.largestAttackDamage} IS NULL OR ${t.largestAttackDamage} >= 0) AND
    (${t.largestCriticalStrike} IS NULL OR ${t.largestCriticalStrike} >= 0) AND
    (${t.longestTimeLiving} IS NULL OR ${t.longestTimeLiving} >= 0) AND
    (${t.timeSpentDead} IS NULL OR ${t.timeSpentDead} >= 0)
  `)
]);

// Keep the original SQL names, including "secundary", for traceable mapping.
export const playerGameRunes = pgTable('player_game_runes', {
  id: uuid('id').primaryKey().references(() => playerGameInfo.id, { onDelete: 'cascade' }),
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
  ...timestamps
});

export const playerGameBuild = pgTable('player_game_build', {
  id: uuid('id').primaryKey().references(() => playerGameInfo.id, { onDelete: 'cascade' }),
  item0: integer('item_0').notNull().default(0),
  item1: integer('item_1').notNull().default(0),
  item2: integer('item_2').notNull().default(0),
  item3: integer('item_3').notNull().default(0),
  item4: integer('item_4').notNull().default(0),
  item5: integer('item_5').notNull().default(0),
  trinket: integer('trinket').notNull().default(0),
  summonerSpell1Id: integer('summoner_spell_1_id'),
  summonerSpell2Id: integer('summoner_spell_2_id'),
  ...timestamps
});

export const pickemPredictions = pgTable('pickem_predictions', {
  id: uuid('id').defaultRandom().primaryKey(),
  discordUserId: uuid('discord_user_id').notNull().references(() => discordUsers.id, { onDelete: 'cascade' }),
  matchId: uuid('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  selectedTeamId: uuid('selected_team_id').notNull().references(() => teams.id, { onDelete: 'restrict' }),
  ...timestamps
}, (table) => [
  unique('pickem_predictions_user_match_key').on(table.discordUserId, table.matchId),
  index('pickem_predictions_match_id_idx').on(table.matchId)
]);

export const pickemBonusQuestions = pgTable('pickem_bonus_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  seasonId: uuid('season_id').notNull().references(() => seasons.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  questionType: pickemQuestionType('question_type').notNull(),
  locksAt: timestamp('locks_at', { withTimezone: true }).notNull(),
  correctAnswer: text('correct_answer'),
  ...timestamps
}, (table) => [index('pickem_bonus_questions_season_id_idx').on(table.seasonId)]);

export const pickemBonusAnswers = pgTable('pickem_bonus_answers', {
  id: uuid('id').defaultRandom().primaryKey(),
  discordUserId: uuid('discord_user_id').notNull().references(() => discordUsers.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => pickemBonusQuestions.id, { onDelete: 'cascade' }),
  answer: text('answer').notNull(),
  ...timestamps
}, (table) => [unique('pickem_bonus_answers_user_question_key').on(table.discordUserId, table.questionId)]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorDiscordUserId: uuid('actor_discord_user_id').references(() => discordUsers.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 120 }).notNull(),
  entityType: varchar('entity_type', { length: 64 }).notNull(),
  entityId: uuid('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  ...timestamps
}, (table) => [index('audit_logs_entity_idx').on(table.entityType, table.entityId)]);
