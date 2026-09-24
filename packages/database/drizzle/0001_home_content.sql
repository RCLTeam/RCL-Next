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
	"division_id" uuid PRIMARY KEY NOT NULL,
	"label" varchar(120) NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"players" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "home_weekly_teams" ADD CONSTRAINT "home_weekly_teams_division_id_seasons_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."seasons_divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "editorial_home_idx" ON "editorial_articles" USING btree ("published","show_on_home","home_order");
