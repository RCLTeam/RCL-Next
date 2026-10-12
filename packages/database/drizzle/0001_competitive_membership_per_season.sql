-- Enforce one competitive membership per Discord user across all divisions of a season.
-- Run through the transactional migration runner. Existing conflicts abort the
-- migration; no memberships are deleted or reassigned.
-- Composite foreign keys propagate season changes and reject forged seasons.
-- Callers provide season_name explicitly. EXCLUDE arbitrates concurrent registrations.
LOCK TABLE seasons_divisions, teams, team_memberships IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
ALTER TABLE teams ADD COLUMN season_name varchar(120);
--> statement-breakpoint
UPDATE teams AS t
SET season_name = sd.season_name
FROM seasons_divisions AS sd
WHERE sd.id = t.season_division_id;
--> statement-breakpoint
ALTER TABLE teams ALTER COLUMN season_name SET NOT NULL;
--> statement-breakpoint
ALTER TABLE seasons_divisions
ADD CONSTRAINT seasons_divisions_id_season_name_key UNIQUE (id, season_name);
--> statement-breakpoint
ALTER TABLE teams
ADD CONSTRAINT teams_season_division_season_fkey
FOREIGN KEY (season_division_id, season_name)
REFERENCES seasons_divisions (id, season_name)
ON UPDATE CASCADE ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE teams ADD CONSTRAINT teams_id_season_name_key UNIQUE (id, season_name);
--> statement-breakpoint
ALTER TABLE team_memberships ADD COLUMN season_name varchar(120);
--> statement-breakpoint
UPDATE team_memberships AS tm
SET season_name = t.season_name
FROM teams AS t
WHERE t.id = tm.team_id;
--> statement-breakpoint
ALTER TABLE team_memberships ALTER COLUMN season_name SET NOT NULL;
--> statement-breakpoint
ALTER TABLE team_memberships
ADD CONSTRAINT team_memberships_team_season_fkey
FOREIGN KEY (team_id, season_name)
REFERENCES teams (id, season_name)
ON UPDATE CASCADE ON DELETE CASCADE;
--> statement-breakpoint
-- Equality operators for varchar columns in the GiST exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE team_memberships
ADD CONSTRAINT one_competitive_team_per_player_and_season
EXCLUDE USING gist (
  season_name WITH =,
  discord_user_id WITH =
)
WHERE (role IN ('top', 'jungle', 'mid', 'adc', 'support', 'substitute'));
