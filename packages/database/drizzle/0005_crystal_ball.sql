CREATE TABLE "crystal_ball_campaigns" (
	"season_name" varchar(120) PRIMARY KEY NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_by" varchar(32),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crystal_ball_window_check" CHECK ("crystal_ball_campaigns"."opens_at" < "crystal_ball_campaigns"."closes_at"),
	CONSTRAINT "crystal_ball_results_object_check" CHECK (jsonb_typeof("crystal_ball_campaigns"."results") = 'object')
);
--> statement-breakpoint
CREATE TABLE "crystal_ball_entries" (
	"season_name" varchar(120) NOT NULL,
	"discord_user_id" varchar(32) NOT NULL,
	"answers" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crystal_ball_entries_season_name_discord_user_id_pk" PRIMARY KEY("season_name","discord_user_id"),
	CONSTRAINT "crystal_ball_answers_object_check" CHECK (jsonb_typeof("crystal_ball_entries"."answers") = 'object')
);
--> statement-breakpoint
ALTER TABLE "crystal_ball_campaigns" ADD CONSTRAINT "crystal_ball_campaigns_season_name_seasons_name_fk" FOREIGN KEY ("season_name") REFERENCES "public"."seasons"("name") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crystal_ball_campaigns" ADD CONSTRAINT "crystal_ball_campaigns_resolved_by_discord_users_discord_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."discord_users"("discord_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crystal_ball_entries" ADD CONSTRAINT "crystal_ball_entries_season_name_crystal_ball_campaigns_season_name_fk" FOREIGN KEY ("season_name") REFERENCES "public"."crystal_ball_campaigns"("season_name") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "crystal_ball_entries" ADD CONSTRAINT "crystal_ball_entries_discord_user_id_discord_users_discord_id_fk" FOREIGN KEY ("discord_user_id") REFERENCES "public"."discord_users"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crystal_ball_entries_user_idx" ON "crystal_ball_entries" USING btree ("discord_user_id");