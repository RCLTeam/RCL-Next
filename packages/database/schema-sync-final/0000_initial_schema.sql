CREATE TYPE "public"."app_role" AS ENUM('viewer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."game_side" AS ENUM('blue', 'red');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'live', 'completed', 'cancelled', 'forfeit');--> statement-breakpoint
CREATE TYPE "public"."pickem_question_type" AS ENUM('team', 'player', 'champion', 'number', 'text');--> statement-breakpoint
CREATE TYPE "public"."roster_role" AS ENUM('top', 'jungle', 'mid', 'adc', 'support', 'substitute', 'coach', 'staff', 'partners');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('regular', 'playoff');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_discord_user_id" varchar(32),
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
CREATE TABLE "divisions" (
	"name" varchar(80) PRIMARY KEY NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matches_id" uuid NOT NULL,
	"game_number" smallint NOT NULL,
	"blue_team_id" uuid NOT NULL,
	"red_team_id" uuid NOT NULL,
	"winner_team_id" uuid,
	"duration_seconds" integer,
	"external_game_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_games_matches_id_game_number_unique" UNIQUE("matches_id","game_number"),
	CONSTRAINT "match_games_external_game_id_key" UNIQUE("external_game_id"),
	CONSTRAINT "match_games_different_teams_check" CHECK ("blue_team_id" <> "red_team_id"),
	CONSTRAINT "match_games_number_check" CHECK ("game_number" > 0),
	CONSTRAINT "match_games_duration_check" CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0),
	CONSTRAINT "match_games_winner_participant_check" CHECK ("winner_team_id" IS NULL OR "winner_team_id" IN ("blue_team_id", "red_team_id"))
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_season_division" uuid NOT NULL,
	"id_round" smallint,
	"team1_id" uuid NOT NULL,
	"team2_id" uuid NOT NULL,
	"best_of" smallint DEFAULT 1 NOT NULL,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"winner_team_id" uuid,
	"team1_score" smallint DEFAULT 0 NOT NULL,
	"team2_score" smallint DEFAULT 0 NOT NULL,
	"stream_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_unique_combination" UNIQUE("id_season_division","id_round","team1_id","team2_id"),
	CONSTRAINT "matches_different_teams_check" CHECK ("team1_id" <> "team2_id"),
	CONSTRAINT "matches_best_of_check" CHECK ("best_of" IN (1, 3, 5)),
	CONSTRAINT "matches_scores_check" CHECK ("team1_score" >= 0 AND "team2_score" >= 0),
	CONSTRAINT "matches_winner_participant_check" CHECK ("winner_team_id" IS NULL OR "winner_team_id" IN ("team1_id", "team2_id"))
);
--> statement-breakpoint
CREATE TABLE "pickem_bonus_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" varchar(32) NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickem_bonus_answers_user_question_key" UNIQUE("discord_user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "pickem_bonus_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_name" varchar(120) NOT NULL,
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
	"discord_user_id" varchar(32) NOT NULL,
	"match_id" uuid NOT NULL,
	"selected_team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickem_predictions_user_match_key" UNIQUE("discord_user_id","match_id")
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
CREATE TABLE "player_game_info" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"side" "game_side" NOT NULL,
	"champion" varchar(64) NOT NULL,
	"position" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_game_info_match_game_player_key" UNIQUE("match_game_id","player_id")
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
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" varchar(32),
	"game_name" varchar(64) NOT NULL,
	"riot_tag" varchar(16),
	"puuid" varchar(128),
	"country_code" varchar(2),
	"is_main" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_game_name_riot_tag_key" UNIQUE("game_name","riot_tag")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" smallint NOT NULL,
	"id_season_division" uuid NOT NULL,
	"stage" "stage" DEFAULT 'regular' NOT NULL,
	"name" varchar(120),
	"starts_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rounds_pkey" PRIMARY KEY("id","id_season_division")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"name" varchar(120) PRIMARY KEY NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_dates_check" CHECK ("ends_on" IS NULL OR "starts_on" IS NULL OR "ends_on" >= "starts_on")
);
--> statement-breakpoint
CREATE TABLE "seasons_divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_name" varchar(120) NOT NULL,
	"division_name" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_divisions_season_division_key" UNIQUE("season_name","division_name")
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"team_id" uuid NOT NULL,
	"discord_user_id" varchar(32) NOT NULL,
	"role" "roster_role" NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"starts_on" date DEFAULT CURRENT_DATE NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_memberships_pkey" PRIMARY KEY("team_id","discord_user_id"),
	CONSTRAINT "team_memberships_dates_check" CHECK ("ends_on" IS NULL OR "ends_on" >= "starts_on"),
	CONSTRAINT "team_memberships_captain_role_check" CHECK ("is_captain" = false OR "role" IN ('top', 'jungle', 'mid', 'adc', 'support'))
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_division_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"short_name" varchar(16),
	"logo_url" text,
	"color" varchar(7),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_season_division_name_key" UNIQUE("season_division_id","name")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_discord_user_id_fkey" FOREIGN KEY ("actor_discord_user_id") REFERENCES "public"."discord_users"("discord_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_matches_id_fkey" FOREIGN KEY ("matches_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_blue_team_id_fkey" FOREIGN KEY ("blue_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_red_team_id_fkey" FOREIGN KEY ("red_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_games" ADD CONSTRAINT "match_games_winner_team_id_fkey" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_round_fkey" FOREIGN KEY ("id_round","id_season_division") REFERENCES "public"."rounds"("id","id_season_division") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_id_season_division_fkey" FOREIGN KEY ("id_season_division") REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team1_id_fkey" FOREIGN KEY ("team1_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team2_id_fkey" FOREIGN KEY ("team2_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_team_id_fkey" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_bonus_answers" ADD CONSTRAINT "pickem_bonus_answers_discord_user_id_fkey" FOREIGN KEY ("discord_user_id") REFERENCES "public"."discord_users"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_bonus_answers" ADD CONSTRAINT "pickem_bonus_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."pickem_bonus_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_bonus_questions" ADD CONSTRAINT "pickem_bonus_questions_season_name_fkey" FOREIGN KEY ("season_name") REFERENCES "public"."seasons"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_predictions" ADD CONSTRAINT "pickem_predictions_discord_user_id_fkey" FOREIGN KEY ("discord_user_id") REFERENCES "public"."discord_users"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_predictions" ADD CONSTRAINT "pickem_predictions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickem_predictions" ADD CONSTRAINT "pickem_predictions_selected_team_id_fkey" FOREIGN KEY ("selected_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_build" ADD CONSTRAINT "player_game_build_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."player_game_info"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_info" ADD CONSTRAINT "player_game_info_match_game_id_fkey" FOREIGN KEY ("match_game_id") REFERENCES "public"."match_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_info" ADD CONSTRAINT "player_game_info_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_info" ADD CONSTRAINT "player_game_info_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_runes" ADD CONSTRAINT "player_game_runes_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."player_game_info"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."player_game_info"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_discord_user_id_fkey" FOREIGN KEY ("discord_user_id") REFERENCES "public"."discord_users"("discord_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_id_season_division_fkey" FOREIGN KEY ("id_season_division") REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons_divisions" ADD CONSTRAINT "seasons_divisions_season_name_fkey" FOREIGN KEY ("season_name") REFERENCES "public"."seasons"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons_divisions" ADD CONSTRAINT "seasons_divisions_division_name_fkey" FOREIGN KEY ("division_name") REFERENCES "public"."divisions"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_discord_user_id_fkey" FOREIGN KEY ("discord_user_id") REFERENCES "public"."discord_users"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_season_division_id_fkey" FOREIGN KEY ("season_division_id") REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_discord_user_id_idx" ON "audit_logs" USING btree ("actor_discord_user_id");--> statement-breakpoint
CREATE INDEX "match_games_matches_id_idx" ON "match_games" USING btree ("matches_id");--> statement-breakpoint
CREATE INDEX "match_games_blue_team_id_idx" ON "match_games" USING btree ("blue_team_id");--> statement-breakpoint
CREATE INDEX "match_games_red_team_id_idx" ON "match_games" USING btree ("red_team_id");--> statement-breakpoint
CREATE INDEX "matches_season_division_scheduled_at_idx" ON "matches" USING btree ("id_season_division","scheduled_at");--> statement-breakpoint
CREATE INDEX "matches_round_idx" ON "matches" USING btree ("id_round","id_season_division");--> statement-breakpoint
CREATE INDEX "matches_team1_id_idx" ON "matches" USING btree ("team1_id");--> statement-breakpoint
CREATE INDEX "matches_team2_id_idx" ON "matches" USING btree ("team2_id");--> statement-breakpoint
CREATE INDEX "pickem_bonus_answers_question_id_idx" ON "pickem_bonus_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "pickem_bonus_answers_discord_user_id_idx" ON "pickem_bonus_answers" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "pickem_bonus_questions_season_name_idx" ON "pickem_bonus_questions" USING btree ("season_name");--> statement-breakpoint
CREATE INDEX "pickem_predictions_match_id_idx" ON "pickem_predictions" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "pickem_predictions_discord_user_id_idx" ON "pickem_predictions" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "player_game_info_match_game_id_idx" ON "player_game_info" USING btree ("match_game_id");--> statement-breakpoint
CREATE INDEX "player_game_info_player_id_idx" ON "player_game_info" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_game_info_team_id_idx" ON "player_game_info" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "players_discord_user_id_idx" ON "players" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX "rounds_season_division_idx" ON "rounds" USING btree ("id_season_division");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_one_active_key" ON "seasons" USING btree ("is_active") WHERE "seasons"."is_active" = true;--> statement-breakpoint
CREATE INDEX "seasons_divisions_season_name_idx" ON "seasons_divisions" USING btree ("season_name");--> statement-breakpoint
CREATE INDEX "seasons_divisions_division_name_idx" ON "seasons_divisions" USING btree ("division_name");--> statement-breakpoint
CREATE INDEX "team_memberships_team_id_idx" ON "team_memberships" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_memberships_discord_user_id_idx" ON "team_memberships" USING btree ("discord_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_memberships_unique_captain" ON "team_memberships" USING btree ("team_id") WHERE "team_memberships"."is_captain" = true;--> statement-breakpoint
CREATE INDEX "teams_season_division_id_idx" ON "teams" USING btree ("season_division_id");
