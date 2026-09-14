CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "app_role" AS ENUM ('viewer', 'admin');
CREATE TYPE "roster_role" AS ENUM ('top', 'jungle', 'mid', 'adc', 'support', 'substitute', 'coach', 'staff', 'partners');
CREATE TYPE "match_status" AS ENUM ('scheduled', 'live', 'completed', 'cancelled', 'forfeit');
CREATE TYPE "game_side" AS ENUM ('blue', 'red');
CREATE TYPE "pickem_question_type" AS ENUM ('team', 'player', 'text'); /*TO DO*/

CREATE TABLE "seasons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(120) NOT NULL, 
  "starts_on" date, 
  "ends_on" date,
  "is_active" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "divisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), 
  "season_id" uuid NOT NULL REFERENCES "seasons"("id") ON DELETE CASCADE,
  "code" varchar(32) NOT NULL,
  "name" varchar(80) NOT NULL, 
  "sort_order" smallint NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "divisions_season_code_key" UNIQUE ("season_id", "code")
);

CREATE TABLE "discord_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), 
  "discord_id" varchar(32) NOT NULL UNIQUE,
  "username" varchar(64) NOT NULL, 
  "global_name" varchar(64), 
  "avatar_hash" varchar(128),
  "role" "app_role" NOT NULL DEFAULT 'viewer',
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), 
  "division_id" uuid NOT NULL REFERENCES "divisions"("id") ON DELETE RESTRICT,
  "name" varchar(120) NOT NULL, 
  "short_name" varchar(16), 
  "logo_url" text, 
  "color" varchar(7),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "players" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), 
  "discord_user_id" uuid REFERENCES "discord_users"("id") ON DELETE SET NULL,
  "game_name" varchar(64) NOT NULL, 
  "riot_tag" varchar(16), 
  "country_code" varchar(2), 
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "players_discord_user_id_key" UNIQUE ("discord_user_id")
);

CREATE TABLE "team_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), 
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE RESTRICT, 
  "role" "roster_role" NOT NULL,
  "is_captain" boolean NOT NULL DEFAULT false, 
  "starts_on" date NOT NULL, 
  "ends_on" date,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "team_memberships_dates_check" CHECK ("ends_on" IS NULL OR "ends_on" >= "starts_on")
);

CREATE TABLE "rounds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), 
  "division_id" uuid NOT NULL REFERENCES "divisions"("id") ON DELETE CASCADE,
  "sequence" smallint NOT NULL, 
  "stage" varchar(64) NOT NULL DEFAULT 'regular', 
  "name" varchar(120),
  "starts_at" timestamptz, 
  "lock_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "rounds_division_sequence_stage_key" UNIQUE ("division_id", "sequence", "stage")
);

CREATE TABLE "matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "division_id" uuid NOT NULL REFERENCES "divisions"("id") ON DELETE RESTRICT,
  "round_id" uuid REFERENCES "rounds"("id") ON DELETE SET NULL,
  "home_team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE RESTRICT,
  "away_team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE RESTRICT,
  "best_of" smallint NOT NULL DEFAULT 1, 
  "status" "match_status" NOT NULL DEFAULT 'scheduled',
  "scheduled_at" timestamptz, 
  "finished_at" timestamptz, 
  "winner_team_id" uuid REFERENCES "teams"("id") ON DELETE RESTRICT,
  "home_score" smallint NOT NULL DEFAULT 0, 
  "away_score" smallint NOT NULL DEFAULT 0, 
  "stream_url" text, 
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "matches_different_teams_check" CHECK ("home_team_id" <> "away_team_id"),
  CONSTRAINT "matches_best_of_check" CHECK ("best_of" IN (1, 3, 5)),
  CONSTRAINT "matches_scores_check" CHECK ("home_score" >= 0 AND "away_score" >= 0)
);

CREATE TABLE "match_games" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), 
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "game_number" smallint NOT NULL, 
  "blue_team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE RESTRICT,
  "red_team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE RESTRICT,
  "winner_team_id" uuid REFERENCES "teams"("id") ON DELETE RESTRICT, 
  "duration_seconds" integer,
  "external_game_id" varchar(128) UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "match_games_match_game_number_key" UNIQUE ("match_id", "game_number"),
  CONSTRAINT "match_games_different_teams_check" CHECK ("blue_team_id" <> "red_team_id"),
  CONSTRAINT "match_games_number_check" CHECK ("game_number" > 0),
  CONSTRAINT "match_games_duration_check" CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0)
);

CREATE TABLE "player_game_info" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), 
  "match_game_id" uuid NOT NULL REFERENCES "match_games"("id") ON DELETE CASCADE,
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE RESTRICT, 
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE RESTRICT,
  "side" "game_side" NOT NULL, 
  "champion" varchar(64) NOT NULL,
  "runes_id" uuid NOT NULL REFERENCES "player_game_runes"("id") ON DELETE RESTRICT,
  "build_id" uuid NOT NULL REFERENCES "player_game_build"("id") ON DELETE RESTRICT,
  "stats_id" uuid NOT NULL REFERENCES "player_game_stats"("id") ON DELETE RESTRICT
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now(),
);

CREATE TABLE "player_game_stats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES "player_game_info"("id") ON DELETE CASCADE, 
  "kills" smallint NOT NULL DEFAULT 0, 
  "deaths" smallint NOT NULL DEFAULT 0, 
  "assists" smallint NOT NULL DEFAULT 0,
  "cs" smallint NOT NULL DEFAULT 0, 
  "damage_to_champions" integer NOT NULL DEFAULT 0, 
  "is_mvp" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "player_game_stats_game_player_key" UNIQUE ("match_game_id", "player_id"),
  CONSTRAINT "player_game_stats_non_negative_check" CHECK ("kills" >= 0 AND "deaths" >= 0 AND "assists" >= 0 AND "cs" >= 0 AND "damage_to_champions" >= 0)
);

CREATE TABLE "player_game_runes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES "player_game_info"("id") ON DELETE CASCADE, 
  "primary_keystone_id" integer NOT NULL,
  "secundary_rune_id" integer NOT NULL,
  "primary_perk" integer NOT NULL,
  "primary_perk_1" integer NOT NULL,
  "primary_perk_2" integer NOT NULL,
  "primary_perk_3" integer NOT NULL,
  "secundary_perk_1" integer NOT NULL,
  "secundary_perk_2" integer NOT NULL,
  "stat_perk_offense" integer NOT NULL,
  "stat_perk_flex" integer NOT NULL,
  "stat_perk_defense" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "player_game_build" (
  "id" uuid PRIMARY KEY REFERENCES "player_game_info"("id") ON DELETE CASCADE,
  "item_0" integer NOT NULL DEFAULT 0,
  "item_1" integer NOT NULL DEFAULT 0,
  "item_2" integer NOT NULL DEFAULT 0,
  "item_3" integer NOT NULL DEFAULT 0,
  "item_4" integer NOT NULL DEFAULT 0,
  "item_5" integer NOT NULL DEFAULT 0,
  "trinket" integer NOT NULL DEFAULT 0 
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now(),
);

CREATE TABLE "pickem_predictions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), 
  "discord_user_id" uuid NOT NULL REFERENCES "discord_users"("id") ON DELETE CASCADE,
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "selected_team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "pickem_predictions_user_match_key" UNIQUE ("discord_user_id", "match_id")
);

CREATE TABLE "pickem_bonus_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), 
  "season_id" uuid NOT NULL REFERENCES "seasons"("id") ON DELETE CASCADE,
  "prompt" text NOT NULL, 
  "question_type" "pickem_question_type" NOT NULL, 
  "locks_at" timestamptz NOT NULL, 
  "correct_answer" text,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "pickem_bonus_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), 
  "discord_user_id" uuid NOT NULL REFERENCES "discord_users"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "pickem_bonus_questions"("id") ON DELETE CASCADE, 
  "answer" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), 
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "pickem_bonus_answers_user_question_key" UNIQUE ("discord_user_id", "question_id")
);

CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), 
  "actor_discord_user_id" uuid REFERENCES "discord_users"("id") ON DELETE SET NULL,
  "action" varchar(120) NOT NULL, 
  "entity_type" varchar(64) NOT NULL, "entity_id" uuid,
  "before" jsonb, 
  "after" jsonb, 
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "teams_division_id_idx" ON "teams" ("division_id");
CREATE INDEX "players_riot_id_idx" ON "players" ("game_name", "riot_tag");
CREATE INDEX "team_memberships_team_id_idx" ON "team_memberships" ("team_id");
CREATE INDEX "team_memberships_player_id_idx" ON "team_memberships" ("player_id");
CREATE INDEX "rounds_division_id_idx" ON "rounds" ("division_id");
CREATE INDEX "matches_division_scheduled_at_idx" ON "matches" ("division_id", "scheduled_at");
CREATE INDEX "matches_round_id_idx" ON "matches" ("round_id");
CREATE INDEX "matches_home_team_id_idx" ON "matches" ("home_team_id");
CREATE INDEX "matches_away_team_id_idx" ON "matches" ("away_team_id");
CREATE INDEX "match_games_match_id_idx" ON "match_games" ("match_id");
CREATE INDEX "player_game_stats_player_id_idx" ON "player_game_stats" ("player_id");
CREATE INDEX "player_game_stats_team_id_idx" ON "player_game_stats" ("team_id");
CREATE INDEX "pickem_predictions_match_id_idx" ON "pickem_predictions" ("match_id");
CREATE INDEX "pickem_bonus_questions_season_id_idx" ON "pickem_bonus_questions" ("season_id");
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" ("entity_type", "entity_id");

-- Trigger para actualizar automáticamente la columna "updated_at" en todas las tablas cuando se realice un UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
$$ LANGUAGE plpgsql;
-- Definicion del trigger
CREATE TRIGGER trigger_updated_at 
BEFORE UPDATE ON * 
FOR EACH ROW 
EXECUTE FUNCTION set_updated_at();

--Trigger para asegurar que solo haya una temporada activa a la vez.
CREATE OR REPLACE FUNCTION check_single_active_season()
RETURNS TRIGGER AS $$
  BEGIN
    IF NEW.is_active = true THEN
      IF EXISTS (
        SELECT 1 
        FROM "seasons" 
        WHERE "is_active" = true 
          AND "id" <> NEW.id
      ) THEN
        RAISE EXCEPTION 'Ya existe una temporada activa. Desactiva la temporada actual antes de activar otra.';
      END IF;
    END IF;
    RETURN NEW;
  END;
$$ LANGUAGE plpgsql;
-- Definicion del trigger
CREATE TRIGGER "trigger_check_single_active_season"
BEFORE INSERT OR UPDATE OF "is_active" ON "seasons"
FOR EACH ROW
WHEN (NEW.is_active = true)
EXECUTE FUNCTION check_single_active_season();