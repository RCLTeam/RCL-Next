ALTER TABLE "matches" ADD COLUMN "mvp_player_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "mvp_score" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_mvp_player_id_fkey" FOREIGN KEY ("mvp_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_round_mvp_score_idx" ON "matches" USING btree ("id_season_division","id_round","mvp_score" DESC NULLS LAST) WHERE "status" = 'completed' AND "mvp_player_id" IS NOT NULL;