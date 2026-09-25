CREATE TYPE "public"."app_role" AS ENUM('viewer', 'admin', 'owner');--> statement-breakpoint
CREATE TYPE "public"."game_side" AS ENUM('blue', 'red');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('regular', 'playoff');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'live', 'completed', 'cancelled', 'forfeit');--> statement-breakpoint
CREATE TYPE "public"."roster_role" AS ENUM('top', 'jungle', 'mid', 'adc', 'support', 'substitute', 'coach', 'staff', 'partners');--> statement-breakpoint
CREATE TYPE "public"."roster_movement_action" AS ENUM('joined', 'left', 'promoted_to_captain', 'demoted_from_captain', 'role_changed');--> statement-breakpoint
CREATE TABLE "discord_users" (
	"discord_id" varchar(32) PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"global_name" varchar(64),
	"avatar_hash" varchar(128),
	"role" "public"."app_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"discord_user_id" varchar(32) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_discord_user_id_discord_users_discord_id_fk" FOREIGN KEY ("discord_user_id") REFERENCES "public"."discord_users"("discord_id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_discord_user_id" varchar(32) REFERENCES "public"."discord_users"("discord_id") ON DELETE set null ON UPDATE no action,
	"action" varchar(120) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"name" varchar(120) PRIMARY KEY NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_dates_check" CHECK ("ends_on" IS NULL OR "starts_on" IS NULL OR "ends_on" >= "starts_on")
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"name" varchar(80) PRIMARY KEY NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons_divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_name" varchar(120) NOT NULL REFERENCES "public"."seasons"("name") ON DELETE cascade ON UPDATE no action,
	"division_name" varchar(80) NOT NULL REFERENCES "public"."divisions"("name") ON DELETE cascade ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_divisions_season_division_key" UNIQUE ("season_name", "division_name")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" varchar(32) REFERENCES "public"."discord_users"("discord_id") ON DELETE set null ON UPDATE no action,
	"game_name" varchar(64) NOT NULL,
	"riot_tag" varchar(16),
	"puuid" varchar(128),
	"country_code" varchar(2),
	"is_main" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_game_name_riot_tag_key" UNIQUE ("game_name", "riot_tag")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_division_id" uuid NOT NULL REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action,
	"name" varchar(120) NOT NULL,
	"short_name" varchar(16),
	"logo_url" text,
	"color" varchar(7),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_season_division_name_key" UNIQUE ("season_division_id", "name")
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action,
	"discord_user_id" varchar(32) NOT NULL REFERENCES "public"."discord_users"("discord_id") ON DELETE cascade ON UPDATE no action,
	"role" "public"."roster_role" NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_memberships_captain_role_check" CHECK ("is_captain" = false OR "role" IN ('top', 'jungle', 'mid', 'adc', 'support')),
	PRIMARY KEY ("team_id", "discord_user_id")
);
--> statement-breakpoint
CREATE TABLE "roster_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action,
	"discord_user_id" varchar(32) NOT NULL REFERENCES "public"."discord_users"("discord_id") ON DELETE cascade ON UPDATE no action,
	"action" "public"."roster_movement_action" NOT NULL,
	"role" "public"."roster_role",
	"actor_id" varchar(32) REFERENCES "public"."discord_users"("discord_id") ON DELETE set null ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" smallint NOT NULL,
	"id_season_division" uuid NOT NULL REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action,
	"stage" "public"."stage" DEFAULT 'regular' NOT NULL,
	"name" varchar(120),
	"starts_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("id", "id_season_division")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_season_division" uuid NOT NULL REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action,
	"id_round" smallint,
	"team1_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action,
	"team2_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action,
	"best_of" smallint DEFAULT 1 NOT NULL,
	"status" "public"."match_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"winner_team_id" uuid REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action,
	"team1_score" smallint DEFAULT 0 NOT NULL,
	"team2_score" smallint DEFAULT 0 NOT NULL,
	"stream_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_different_teams_check" CHECK ("team1_id" <> "team2_id"),
	CONSTRAINT "matches_best_of_check" CHECK ("best_of" IN (1, 3, 5)),
	CONSTRAINT "matches_scores_check" CHECK ("team1_score" >= 0 AND "team2_score" >= 0),
	CONSTRAINT "matches_winner_participant_check" CHECK ("winner_team_id" IS NULL OR "winner_team_id" IN ("team1_id", "team2_id")),
	CONSTRAINT "matches_unique_combination" UNIQUE ("id_season_division", "id_round", "team1_id", "team2_id"),
	CONSTRAINT "matches_round_fkey" FOREIGN KEY ("id_round", "id_season_division") REFERENCES "public"."rounds"("id", "id_season_division") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "match_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matches_id" uuid NOT NULL REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action,
	"game_number" smallint NOT NULL,
	"blue_team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action,
	"red_team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action,
	"winner_team_id" uuid REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action,
	"duration_seconds" integer,
	"external_game_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_games_different_teams_check" CHECK ("blue_team_id" <> "red_team_id"),
	CONSTRAINT "match_games_number_check" CHECK ("game_number" > 0),
	CONSTRAINT "match_games_duration_check" CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0),
	CONSTRAINT "match_games_winner_participant_check" CHECK ("winner_team_id" IS NULL OR "winner_team_id" IN ("blue_team_id", "red_team_id")),
	CONSTRAINT "match_games_matches_id_game_number_unique" UNIQUE ("matches_id", "game_number"),
	CONSTRAINT "match_games_external_game_id_key" UNIQUE ("external_game_id")
);
--> statement-breakpoint
CREATE TABLE "player_game_info" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_game_id" uuid NOT NULL REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action,
	"player_id" uuid NOT NULL REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action,
	"team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action,
	"side" "public"."game_side" NOT NULL,
	"champion" varchar(64) NOT NULL,
	"position" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_game_info_match_game_player_key" UNIQUE ("match_game_id", "player_id")
);
--> statement-breakpoint
CREATE TABLE "player_game_build" (
	"id" uuid PRIMARY KEY REFERENCES "public"."player_game_info"("id") ON DELETE cascade ON UPDATE no action,
	"item_0" integer DEFAULT 0 NOT NULL,
	"item_1" integer DEFAULT 0 NOT NULL,
	"item_2" integer DEFAULT 0 NOT NULL,
	"item_3" integer DEFAULT 0 NOT NULL,
	"item_4" integer DEFAULT 0 NOT NULL,
	"item_5" integer DEFAULT 0 NOT NULL,
	"trinket" integer DEFAULT 0 NOT NULL,
	"summoner_spell_1_id" integer,
	"summoner_spell_2_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_game_runes" (
	"id" uuid PRIMARY KEY REFERENCES "public"."player_game_info"("id") ON DELETE cascade ON UPDATE no action,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_game_stats" (
	"id" uuid PRIMARY KEY REFERENCES "public"."player_game_info"("id") ON DELETE cascade ON UPDATE no action,
	"kills" smallint DEFAULT 0 NOT NULL,
	"deaths" smallint DEFAULT 0 NOT NULL,
	"assists" smallint DEFAULT 0 NOT NULL,
	"cs" smallint DEFAULT 0 NOT NULL,
	"damage_to_champions" integer DEFAULT 0 NOT NULL,
	"vision_score" integer,
	"double_kills" integer,
	"triple_kills" integer,
	"quadra_kills" integer,
	"penta_kills" integer,
	"largest_killing_spree" integer,
	"gold_earned" integer,
	"level" integer,
	"damage_taken_from_champions" integer,
	"damage_mitigated" integer,
	"crowd_control_time" integer,
	"turrets_killed" integer,
	"turret_takedowns" integer,
	"inhibitors_killed" integer,
	"inhibitor_takedowns" integer,
	"wards_placed" integer,
	"wards_destroyed" integer,
	"control_wards_purchased" integer,
	"detector_wards_placed" integer,
	"pings" integer,
	"summoner_spell_1_casts" integer,
	"summoner_spell_2_casts" integer,
	"dragons_killed" integer,
	"barons_killed" integer,
	"rift_heralds_killed" integer,
	"void_grubs_killed" integer,
	"elder_dragons_killed" integer,
	"objectives_stolen" integer,
	"objectives_stolen_assists" integer,
	"largest_ability_damage" integer,
	"largest_attack_damage" integer,
	"largest_critical_strike" integer,
	"longest_time_living" integer,
	"time_spent_dead" integer,
	"is_mvp" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_game_stats_non_negative_check" CHECK ("kills" >= 0 AND "deaths" >= 0 AND "assists" >= 0 AND "cs" >= 0 AND "damage_to_champions" >= 0),
	CONSTRAINT "player_game_stats_vision_check" CHECK ("vision_score" IS NULL OR "vision_score" >= 0),
	CONSTRAINT "player_game_stats_rofl_non_negative_check" CHECK (
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
  )
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" varchar(32) NOT NULL REFERENCES "public"."discord_users"("discord_id") ON DELETE cascade ON UPDATE no action,
	"match_id" uuid NOT NULL REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action,
	"selected_team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "predictions_user_match_key" UNIQUE ("discord_user_id", "match_id")
);
--> statement-breakpoint
CREATE TABLE "editorial_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(180) NOT NULL,
	"excerpt" varchar(500) NOT NULL,
	"body" text NOT NULL,
	"kind" varchar(20) NOT NULL,
	"author" varchar(120) NOT NULL,
	"cover_url" text DEFAULT '' NOT NULL,
	"cover_alt" varchar(240) DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"show_on_home" boolean DEFAULT false NOT NULL,
	"home_order" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_kind_check" CHECK ("editorial_articles"."kind" in ('noticia', 'reportaje', 'entrevista', 'otro')),
	CONSTRAINT "editorial_order_check" CHECK ("editorial_articles"."home_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "home_weekly_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"round_id" smallint,
	"label" varchar(120) NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"players" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_weekly_teams_division_id_seasons_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "home_weekly_teams_round_fkey" FOREIGN KEY ("round_id","division_id") REFERENCES "public"."rounds"("id","id_season_division") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "home_weekly_teams_division_round_key" UNIQUE("division_id","round_id")
);
--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type", "entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_discord_user_id_idx" ON "audit_logs" USING btree ("actor_discord_user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_states_expires_at_idx" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "seasons_divisions_season_name_idx" ON "seasons_divisions" USING btree ("season_name");--> statement-breakpoint
CREATE INDEX "seasons_divisions_division_name_idx" ON "seasons_divisions" USING btree ("division_name");--> statement-breakpoint
CREATE INDEX "teams_season_division_id_idx" ON "teams" USING btree ("season_division_id");--> statement-breakpoint
CREATE INDEX "players_discord_user_id_idx" ON "players" USING btree ("discord_user_id");--> statement-breakpoint
-- puuid se permite NULL y de momento no tiene restricción UNIQUE: no se dispone de API de Riot
-- y los IDs de repetición no son fidedignos al depender del cliente y claves intermedias efímeras.
-- CREATE UNIQUE INDEX "players_puuid_key" ON "players" USING btree ("puuid");--> statement-breakpoint
CREATE INDEX "team_memberships_team_id_idx" ON "team_memberships" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_memberships_discord_user_id_idx" ON "team_memberships" USING btree ("discord_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_memberships_unique_captain" ON "team_memberships" USING btree ("team_id") WHERE "team_memberships"."is_captain" = true;--> statement-breakpoint
CREATE INDEX "roster_movements_team_id_idx" ON "roster_movements" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "roster_movements_discord_user_id_idx" ON "roster_movements" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "roster_movements_actor_id_idx" ON "roster_movements" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "roster_movements_created_at_idx" ON "roster_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rounds_season_division_idx" ON "rounds" USING btree ("id_season_division");--> statement-breakpoint
CREATE INDEX "matches_season_division_scheduled_at_idx" ON "matches" USING btree ("id_season_division", "scheduled_at");--> statement-breakpoint
CREATE INDEX "matches_round_idx" ON "matches" USING btree ("id_round", "id_season_division");--> statement-breakpoint
CREATE INDEX "matches_team1_id_idx" ON "matches" USING btree ("team1_id");--> statement-breakpoint
CREATE INDEX "matches_team2_id_idx" ON "matches" USING btree ("team2_id");--> statement-breakpoint
CREATE INDEX "match_games_matches_id_idx" ON "match_games" USING btree ("matches_id");--> statement-breakpoint
CREATE INDEX "match_games_blue_team_id_idx" ON "match_games" USING btree ("blue_team_id");--> statement-breakpoint
CREATE INDEX "match_games_red_team_id_idx" ON "match_games" USING btree ("red_team_id");--> statement-breakpoint
CREATE INDEX "player_game_info_match_game_id_idx" ON "player_game_info" USING btree ("match_game_id");--> statement-breakpoint
CREATE INDEX "player_game_info_player_id_idx" ON "player_game_info" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_game_info_team_id_idx" ON "player_game_info" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "predictions_match_id_idx" ON "predictions" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "predictions_discord_user_id_idx" ON "predictions" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "editorial_home_idx" ON "editorial_articles" USING btree ("published","show_on_home","home_order");--> statement-breakpoint
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'seasons', 'divisions', 'seasons_divisions', 'discord_users', 'teams', 'players', 'team_memberships',
    'roster_movements', 'rounds', 'matches', 'match_games', 'player_game_info', 'player_game_stats',
    'player_game_runes', 'player_game_build', 'predictions',
    'audit_logs'
  ] LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name);
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION check_match_games_teams() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_team1_id uuid;
  v_team2_id uuid;
BEGIN
  SELECT team1_id, team2_id INTO v_team1_id, v_team2_id
  FROM matches
  WHERE id = NEW.matches_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent match does not exist' USING ERRCODE = '23503';
  END IF;

  IF (NEW.blue_team_id <> v_team1_id AND NEW.blue_team_id <> v_team2_id)
     OR (NEW.red_team_id <> v_team1_id AND NEW.red_team_id <> v_team2_id) THEN
    RAISE EXCEPTION 'Blue and red teams must belong to the parent match' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER check_match_games_teams_trigger
BEFORE INSERT OR UPDATE ON match_games
FOR EACH ROW EXECUTE FUNCTION check_match_games_teams();
--> statement-breakpoint
CREATE FUNCTION require_complete_player_game() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE participation_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN participation_id := OLD.id;
  ELSE participation_id := NEW.id;
  END IF;
  IF EXISTS (SELECT 1 FROM player_game_info WHERE id = participation_id)
    AND (
      NOT EXISTS (SELECT 1 FROM player_game_stats WHERE id = participation_id)
      OR NOT EXISTS (SELECT 1 FROM player_game_runes WHERE id = participation_id)
      OR NOT EXISTS (SELECT 1 FROM player_game_build WHERE id = participation_id)
    ) THEN
    RAISE EXCEPTION 'Incomplete player game snapshot' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.id <> NEW.id
     AND EXISTS (SELECT 1 FROM player_game_info WHERE id = OLD.id) THEN
    RAISE EXCEPTION 'Snapshot identity cannot be moved' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['player_game_info', 'player_game_stats', 'player_game_runes', 'player_game_build'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER complete_player_game AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_complete_player_game()', table_name);
  END LOOP;
END;
$$;
