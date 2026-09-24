ALTER TABLE "home_weekly_teams" DROP CONSTRAINT "home_weekly_teams_pkey";--> statement-breakpoint
ALTER TABLE "home_weekly_teams" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "home_weekly_teams" ADD COLUMN "round_id" smallint;--> statement-breakpoint
ALTER TABLE "home_weekly_teams" ADD CONSTRAINT "home_weekly_teams_round_fkey" FOREIGN KEY ("round_id","division_id") REFERENCES "public"."rounds"("id","id_season_division") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_weekly_teams" ADD CONSTRAINT "home_weekly_teams_division_round_key" UNIQUE("division_id","round_id");