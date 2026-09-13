import {
  boolean,
  check,
  date,
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
import { sql } from 'drizzle-orm';

export const appRole = pgEnum('app_role', ['viewer', 'editor', 'admin']);
export const rosterRole = pgEnum('roster_role', ['top', 'jungle', 'mid', 'adc', 'support', 'substitute', 'coach']);
export const matchStatus = pgEnum('match_status', ['scheduled', 'live', 'completed', 'cancelled', 'forfeit']);
export const gameSide = pgEnum('game_side', ['blue', 'red']);
export const pickemQuestionType = pgEnum('pickem_question_type', ['team', 'player', 'text']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
};

export const seasons = pgTable('seasons', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
  isActive: boolean('is_active').notNull().default(false),
  ...timestamps
}, (table) => [uniqueIndex('seasons_slug_key').on(table.slug)]);

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
  slug: varchar('slug', { length: 64 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  shortName: varchar('short_name', { length: 16 }),
  logoUrl: text('logo_url'),
  color: varchar('color', { length: 7 }),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps
}, (table) => [
  unique('teams_division_slug_key').on(table.divisionId, table.slug),
  index('teams_division_id_idx').on(table.divisionId)
]);

export const players = pgTable('players', {
  id: uuid('id').defaultRandom().primaryKey(),
  discordUserId: uuid('discord_user_id').references(() => discordUsers.id, { onDelete: 'set null' }),
  gameName: varchar('game_name', { length: 64 }).notNull(),
  riotTag: varchar('riot_tag', { length: 16 }),
  countryCode: varchar('country_code', { length: 2 }),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps
}, (table) => [
  uniqueIndex('players_discord_user_id_key').on(table.discordUserId),
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

export const playerGameStats = pgTable('player_game_stats', {
  id: uuid('id').defaultRandom().primaryKey(),
  matchGameId: uuid('match_game_id').notNull().references(() => matchGames.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull().references(() => players.id, { onDelete: 'restrict' }),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'restrict' }),
  side: gameSide('side').notNull(),
  champion: varchar('champion', { length: 64 }).notNull(),
  kills: smallint('kills').notNull().default(0),
  deaths: smallint('deaths').notNull().default(0),
  assists: smallint('assists').notNull().default(0),
  cs: smallint('cs').notNull().default(0),
  damageToChampions: integer('damage_to_champions').notNull().default(0),
  isMvp: boolean('is_mvp').notNull().default(false),
  ...timestamps
}, (table) => [
  unique('player_game_stats_game_player_key').on(table.matchGameId, table.playerId),
  index('player_game_stats_player_id_idx').on(table.playerId),
  index('player_game_stats_team_id_idx').on(table.teamId),
  check('player_game_stats_non_negative_check', sql`${table.kills} >= 0 AND ${table.deaths} >= 0 AND ${table.assists} >= 0 AND ${table.cs} >= 0 AND ${table.damageToChampions} >= 0`)
]);

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [index('audit_logs_entity_idx').on(table.entityType, table.entityId)]);
