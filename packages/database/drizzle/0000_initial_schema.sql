CREATE TYPE "public"."app_role" AS ENUM('viewer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."game_side" AS ENUM('blue', 'red');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('regular', 'playoff');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'live', 'completed', 'cancelled', 'forfeit');--> statement-breakpoint
CREATE TYPE "public"."pickem_question_type" AS ENUM('team', 'player', 'champion', 'number', 'text');--> statement-breakpoint
CREATE TYPE "public"."roster_role" AS ENUM('top', 'jungle', 'mid', 'adc', 'support', 'substitute', 'coach', 'staff', 'partners');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_discord_user_id" uuid,
	"action" varchar(120) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_users" (
	"discord_id" varchar(32) PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"global_name" varchar(64),
	"avatar_hash" varchar(128),
	"role" "app_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" uuid REFERENCES "public"."discord_users"("id") ON DELETE set null ON UPDATE no action,
	"game_name" varchar(64) NOT NULL,
	"riot_tag" varchar(16),
	"puuid" varchar(128),
	"country_code" varchar(2),
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
	CONSTRAINT "seasons_dates_check" CHECK ("seasons"."ends_on" IS NULL OR "seasons"."starts_on" IS NULL OR "seasons"."ends_on" >= "seasons"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"name" varchar(80) PRIMARY KEY NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" smallint NOT NULL,
	"id_season_division" uuid REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action NOT NULL,
	"stage" "stage" DEFAULT 'regular' NOT NULL,
	"name" varchar(120),
	"starts_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("id","id_season_division")
);
--> statement-breakpoint
CREATE TABLE "seasons_divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_name" varchar(120)  NOT NULL,
	"division_name" varchar(80) NOT NULL,
	CONSTRAINT "seasons_divisions_season_name_fkey" FOREIGN KEY ("season_name") REFERENCES "public"."seasons"("name") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "seasons_divisions_division_name_fkey" FOREIGN KEY ("division_name") REFERENCES "public"."divisions"("name") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"name" varchar(120) NOT NULL,
	"season_division_id" uuid REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action NOT NULL,
	"short_name" varchar(16),
	"logo_url" text,
	"color" varchar(7),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"team_id" uuid REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action NOT NULL,
	"player_id" uuid REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action NOT NULL,
	"role" "roster_role" NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_memberships_dates_check" CHECK ("team_memberships"."ends_on" IS NULL OR "team_memberships"."ends_on" >= "team_memberships"."starts_on"),
	CONSTRAINT "team_memberships_unique_captain" UNIQUE ("team_id") WHERE "team_memberships"."is_captain" = true,
	CONSTRAINT "team_memberships_captain_role_check" CHECK ("team_memberships"."is_captain" = false OR "team_memberships"."role" IN ('top', 'jungle', 'mid', 'adc', 'support')),
	PRIMARY KEY ("team_id", "player_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_season_division" uuid REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action NOT NULL,
	"id_round" smallint REFERENCES "public"."rounds"("id") ON DELETE set null ON UPDATE no action,
	"team1_id" uuid REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action NOT NULL,
	"team2_id" uuid REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action NOT NULL,
	"best_of" smallint DEFAULT 1 NOT NULL,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"winner_team_id" uuid references "public"."teams"("id") ON DELETE set null ON UPDATE no action,
	"team1_score" smallint DEFAULT 0 NOT NULL,
	"team2_score" smallint DEFAULT 0 NOT NULL,
	"stream_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_different_teams_check" CHECK ("matches"."team1_id" <> "matches"."team2_id"),
	CONSTRAINT "matches_best_of_check" CHECK ("matches"."best_of" IN (1, 3, 5)),
	CONSTRAINT "matches_scores_check" CHECK ("matches"."team1_score" >= 0 AND "matches"."team2_score" >= 0)
	CONSTRAINT "matches_unique_combination" UNIQUE ("id_season_division", "id_round", "team1_id", "team2_id")
);
--> statement-breakpoint
CREATE TABLE "match_games" (
	"external_game_id" varchar(128) NOT NULL,
	"matches_id" uuid REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action NOT NULL,
	"game_number" smallint NOT NULL,
	"blue_team_id" uuid REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action NOT NULL,
	"red_team_id" uuid REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action NOT NULL,
	"winner_team_id" uuid REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action,
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_games_different_teams_check" CHECK ("match_games"."blue_team_id" <> "match_games"."red_team_id"),
	CONSTRAINT "match_blue_red_teams_check" CHECK ("match_games"."blue_team_id" IN ("matches"."team1_id", "matches"."team2_id") AND "match_games"."red_team_id" IN ("matches"."team1_id", "matches"."team2_id")),
	CONSTRAINT "match_games_number_check" CHECK ("match_games"."game_number" > 0),
	CONSTRAINT "match_games_duration_check" CHECK ("match_games"."duration_seconds" IS NULL OR "match_games"."duration_seconds" > 0)
	PRiMARY KEY ("matches_id", "game_number")
);
--> statement-breakpoint
CREATE TABLE "player_game_info" (
	"match_game_id" uuid REFERENCES "public"."match_games"("external_game_id") ON DELETE cascade ON UPDATE no action NOT NULL,
	"player_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"side" "game_side" NOT NULL,
	"champion" varchar(64) NOT NULL,
	"position" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_game_info_game_player_key" UNIQUE("match_game_id","player_id")
	PRIMARY KEY ("match_game_id", "player_id")
);
--> statement-breakpoint
CREATE TABLE "player_game_build" (
	"id" uuid PRIMARY KEY NOT NULL,
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
	"id" uuid PRIMARY KEY NOT NULL,
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
	"id" uuid PRIMARY KEY NOT NULL,
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
	CONSTRAINT "player_game_stats_non_negative_check" CHECK ("player_game_stats"."kills" >= 0 AND "player_game_stats"."deaths" >= 0 AND "player_game_stats"."assists" >= 0 AND "player_game_stats"."cs" >= 0 AND "player_game_stats"."damage_to_champions" >= 0),
	CONSTRAINT "player_game_stats_vision_check" CHECK ("player_game_stats"."vision_score" IS NULL OR "player_game_stats"."vision_score" >= 0),
	CONSTRAINT "player_game_stats_rofl_non_negative_check" CHECK (
    ("player_game_stats"."double_kills" IS NULL OR "player_game_stats"."double_kills" >= 0) AND
    ("player_game_stats"."triple_kills" IS NULL OR "player_game_stats"."triple_kills" >= 0) AND
    ("player_game_stats"."quadra_kills" IS NULL OR "player_game_stats"."quadra_kills" >= 0) AND
    ("player_game_stats"."penta_kills" IS NULL OR "player_game_stats"."penta_kills" >= 0) AND
    ("player_game_stats"."largest_killing_spree" IS NULL OR "player_game_stats"."largest_killing_spree" >= 0) AND
    ("player_game_stats"."gold_earned" IS NULL OR "player_game_stats"."gold_earned" >= 0) AND
    ("player_game_stats"."level" IS NULL OR "player_game_stats"."level" >= 0) AND
    ("player_game_stats"."damage_taken_from_champions" IS NULL OR "player_game_stats"."damage_taken_from_champions" >= 0) AND
    ("player_game_stats"."damage_mitigated" IS NULL OR "player_game_stats"."damage_mitigated" >= 0) AND
    ("player_game_stats"."crowd_control_time" IS NULL OR "player_game_stats"."crowd_control_time" >= 0) AND
    ("player_game_stats"."turrets_killed" IS NULL OR "player_game_stats"."turrets_killed" >= 0) AND
    ("player_game_stats"."turret_takedowns" IS NULL OR "player_game_stats"."turret_takedowns" >= 0) AND
    ("player_game_stats"."inhibitors_killed" IS NULL OR "player_game_stats"."inhibitors_killed" >= 0) AND
    ("player_game_stats"."inhibitor_takedowns" IS NULL OR "player_game_stats"."inhibitor_takedowns" >= 0) AND
    ("player_game_stats"."wards_placed" IS NULL OR "player_game_stats"."wards_placed" >= 0) AND
    ("player_game_stats"."wards_destroyed" IS NULL OR "player_game_stats"."wards_destroyed" >= 0) AND
    ("player_game_stats"."control_wards_purchased" IS NULL OR "player_game_stats"."control_wards_purchased" >= 0) AND
    ("player_game_stats"."detector_wards_placed" IS NULL OR "player_game_stats"."detector_wards_placed" >= 0) AND
    ("player_game_stats"."pings" IS NULL OR "player_game_stats"."pings" >= 0) AND
    ("player_game_stats"."summoner_spell_1_casts" IS NULL OR "player_game_stats"."summoner_spell_1_casts" >= 0) AND
    ("player_game_stats"."summoner_spell_2_casts" IS NULL OR "player_game_stats"."summoner_spell_2_casts" >= 0) AND
    ("player_game_stats"."dragons_killed" IS NULL OR "player_game_stats"."dragons_killed" >= 0) AND
    ("player_game_stats"."barons_killed" IS NULL OR "player_game_stats"."barons_killed" >= 0) AND
    ("player_game_stats"."rift_heralds_killed" IS NULL OR "player_game_stats"."rift_heralds_killed" >= 0) AND
    ("player_game_stats"."void_grubs_killed" IS NULL OR "player_game_stats"."void_grubs_killed" >= 0) AND
    ("player_game_stats"."elder_dragons_killed" IS NULL OR "player_game_stats"."elder_dragons_killed" >= 0) AND
    ("player_game_stats"."objectives_stolen" IS NULL OR "player_game_stats"."objectives_stolen" >= 0) AND
    ("player_game_stats"."objectives_stolen_assists" IS NULL OR "player_game_stats"."objectives_stolen_assists" >= 0) AND
    ("player_game_stats"."largest_ability_damage" IS NULL OR "player_game_stats"."largest_ability_damage" >= 0) AND
    ("player_game_stats"."largest_attack_damage" IS NULL OR "player_game_stats"."largest_attack_damage" >= 0) AND
    ("player_game_stats"."largest_critical_strike" IS NULL OR "player_game_stats"."largest_critical_strike" >= 0) AND
    ("player_game_stats"."longest_time_living" IS NULL OR "player_game_stats"."longest_time_living" >= 0) AND
    ("player_game_stats"."time_spent_dead" IS NULL OR "player_game_stats"."time_spent_dead" >= 0)
  )
);
--> statement-breakpoint
CREATE TABLE "pickem_bonus_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickem_bonus_answers_user_question_key" UNIQUE("discord_user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "pickem_bonus_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"question_type" "pickem_question_type" NOT NULL,
	"locks_at" timestamp with time zone NOT NULL,
	"correct_answer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickem_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"selected_team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickem_predictions_user_match_key" UNIQUE("discord_user_id","match_id")
);


--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_discord_user_id_discord_users_id_fk" FOREIGN KEY ("actor_discord_user_id") REFERENCES "public"."discord_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_blue_team_id_teams_id_fk" FOREIGN KEY ("blue_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_red_team_id_teams_id_fk" FOREIGN KEY ("red_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_bonus_answers" ADD CONSTRAINT "pickem_bonus_answers_discord_user_id_discord_users_id_fk" FOREIGN KEY ("discord_user_id") REFERENCES "public"."discord_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_bonus_answers" ADD CONSTRAINT "pickem_bonus_answers_question_id_pickem_bonus_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."pickem_bonus_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_bonus_questions" ADD CONSTRAINT "pickem_bonus_questions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_predictions" ADD CONSTRAINT "pickem_predictions_discord_user_id_discord_users_id_fk" FOREIGN KEY ("discord_user_id") REFERENCES "public"."discord_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_predictions" ADD CONSTRAINT "pickem_predictions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_predictions" ADD CONSTRAINT "pickem_predictions_selected_team_id_teams_id_fk" FOREIGN KEY ("selected_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_build" ADD CONSTRAINT "player_game_build_id_player_game_info_id_fk" FOREIGN KEY ("id") REFERENCES "public"."player_game_info"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_info" ADD CONSTRAINT "player_game_info_match_game_id_match_games_id_fk" FOREIGN KEY ("match_game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_info" ADD CONSTRAINT "player_game_info_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_info" ADD CONSTRAINT "player_game_info_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_runes" ADD CONSTRAINT "player_game_runes_id_player_game_info_id_fk" FOREIGN KEY ("id") REFERENCES "public"."player_game_info"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_id_player_game_info_id_fk" FOREIGN KEY ("id") REFERENCES "public"."player_game_info"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_discord_user_id_discord_users_id_fk" FOREIGN KEY ("discord_user_id") REFERENCES "public"."discord_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_users_discord_id_key" ON "discord_users" USING btree ("discord_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_games_external_game_id_key" ON "match_games" USING btree ("external_game_id");--> statement-breakpoint
CREATE INDEX "match_games_match_id_idx" ON "match_games" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "matches_division_scheduled_at_idx" ON "matches" USING btree ("division_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "matches_round_id_idx" ON "matches" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "matches_home_team_id_idx" ON "matches" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "matches_away_team_id_idx" ON "matches" USING btree ("away_team_id");--> statement-breakpoint
CREATE INDEX "pickem_bonus_questions_season_id_idx" ON "pickem_bonus_questions" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "pickem_predictions_match_id_idx" ON "pickem_predictions" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "player_game_info_player_id_idx" ON "player_game_info" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_game_info_team_id_idx" ON "player_game_info" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_discord_user_id_key" ON "players" USING btree ("discord_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_puuid_key" ON "players" USING btree ("puuid");--> statement-breakpoint
CREATE INDEX "players_riot_id_idx" ON "players" USING btree ("game_name","riot_tag");--> statement-breakpoint
CREATE INDEX "rounds_division_id_idx" ON "rounds" USING btree ("division_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_active_key" ON "seasons" USING btree ("is_active") WHERE "seasons"."is_active" = true;--> statement-breakpoint
CREATE INDEX "team_memberships_team_id_idx" ON "team_memberships" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_memberships_player_id_idx" ON "team_memberships" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "teams_division_id_idx" ON "teams" USING btree ("division_id");
--> statement-breakpoint
-- PostgreSQL-specific invariants not represented by Drizzle's table snapshots.
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
    'seasons','divisions','discord_users','teams','players','team_memberships',
    'rounds','matches','match_games','player_game_info','player_game_stats',
    'player_game_runes','player_game_build','pickem_predictions',
    'pickem_bonus_questions','pickem_bonus_answers','audit_logs'
  ] LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name);
  END LOOP;
END;
$$;
--> statement-breakpoint
ALTER TABLE matches ADD CONSTRAINT matches_winner_participant_check
  CHECK (winner_team_id IS NULL OR winner_team_id IN (home_team_id, away_team_id));
--> statement-breakpoint
ALTER TABLE match_games ADD CONSTRAINT match_games_winner_participant_check
  CHECK (winner_team_id IS NULL OR winner_team_id IN (blue_team_id, red_team_id));
--> statement-breakpoint
-- Enforce all three 1:1 children at COMMIT, so a transaction can insert
-- parent -> stats -> runes -> build without circular foreign keys.
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
  FOREACH table_name IN ARRAY ARRAY['player_game_info','player_game_stats','player_game_runes','player_game_build'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER complete_player_game AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_complete_player_game()', table_name);
  END LOOP;
END;
$$;
