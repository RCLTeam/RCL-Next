CREATE TABLE "crystal_ball_league_campaigns" (
	"division_id" uuid PRIMARY KEY NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_by" varchar(32),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crystal_league_window_check" CHECK ("crystal_ball_league_campaigns"."opens_at" < "crystal_ball_league_campaigns"."closes_at"),
	CONSTRAINT "crystal_league_results_check" CHECK (jsonb_typeof("crystal_ball_league_campaigns"."results") = 'object')
);
--> statement-breakpoint
CREATE TABLE "crystal_ball_league_entries" (
	"division_id" uuid NOT NULL,
	"discord_user_id" varchar(32) NOT NULL,
	"answers" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crystal_ball_league_entries_division_id_discord_user_id_pk" PRIMARY KEY("division_id","discord_user_id"),
	CONSTRAINT "crystal_league_answers_check" CHECK (jsonb_typeof("crystal_ball_league_entries"."answers") = 'object')
);
--> statement-breakpoint
ALTER TABLE "crystal_ball_league_campaigns" ADD CONSTRAINT "crystal_ball_league_campaigns_division_id_seasons_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crystal_ball_league_campaigns" ADD CONSTRAINT "crystal_ball_league_campaigns_resolved_by_discord_users_discord_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."discord_users"("discord_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crystal_ball_league_entries" ADD CONSTRAINT "crystal_ball_league_entries_division_id_crystal_ball_league_campaigns_division_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."crystal_ball_league_campaigns"("division_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crystal_ball_league_entries" ADD CONSTRAINT "crystal_ball_league_entries_discord_user_id_discord_users_discord_id_fk" FOREIGN KEY ("discord_user_id") REFERENCES "public"."discord_users"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crystal_league_entries_user_idx" ON "crystal_ball_league_entries" USING btree ("discord_user_id");