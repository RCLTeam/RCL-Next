CREATE TABLE "crystal_ball_league_campaigns" (
	"division_id" uuid PRIMARY KEY NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"automatic_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"calculated_at" timestamp with time zone,
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
ALTER TABLE "crystal_ball_league_campaigns" ADD CONSTRAINT "crystal_campaign_division_fk" FOREIGN KEY ("division_id") REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crystal_ball_league_campaigns" ADD CONSTRAINT "crystal_campaign_resolver_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."discord_users"("discord_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crystal_ball_league_entries" ADD CONSTRAINT "crystal_entry_campaign_fk" FOREIGN KEY ("division_id") REFERENCES "public"."crystal_ball_league_campaigns"("division_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crystal_ball_league_entries" ADD CONSTRAINT "crystal_entry_user_fk" FOREIGN KEY ("discord_user_id") REFERENCES "public"."discord_users"("discord_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crystal_league_entries_user_idx" ON "crystal_ball_league_entries" USING btree ("discord_user_id");
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crystal_ball_league_campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crystal_ball_league_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
