-- Reconcile databases where migration 0006 was journaled without applying its
-- canonical schedule-week objects. Every statement is safe on a fresh database
-- where 0006 already created the same objects.

CREATE TABLE IF NOT EXISTS "schedule_weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"week_number" integer NOT NULL,
	"play_date" date NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "schedule_week_id" integer;
--> statement-breakpoint
ALTER TABLE "team_byes" ADD COLUMN IF NOT EXISTS "schedule_week_id" integer;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_weeks_season_week"
  ON "schedule_weeks" USING btree ("season_id", "week_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_weeks_id_season"
  ON "schedule_weeks" USING btree ("id", "season_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_schedule_week_idx"
  ON "games" USING btree ("season_id", "schedule_week_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_byes_schedule_week_idx"
  ON "team_byes" USING btree ("season_id", "schedule_week_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schedule_weeks_season_id_seasons_id_fk'
      AND conrelid = 'schedule_weeks'::regclass
  ) THEN
    ALTER TABLE "schedule_weeks"
      ADD CONSTRAINT "schedule_weeks_season_id_seasons_id_fk"
      FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schedule_weeks_positive_week'
      AND conrelid = 'schedule_weeks'::regclass
  ) THEN
    ALTER TABLE "schedule_weeks"
      ADD CONSTRAINT "schedule_weeks_positive_week"
      CHECK ("week_number" > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schedule_weeks_valid_dates'
      AND conrelid = 'schedule_weeks'::regclass
  ) THEN
    ALTER TABLE "schedule_weeks"
      ADD CONSTRAINT "schedule_weeks_valid_dates"
      CHECK ("end_date" >= "start_date");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schedule_weeks_play_date_in_range'
      AND conrelid = 'schedule_weeks'::regclass
  ) THEN
    ALTER TABLE "schedule_weeks"
      ADD CONSTRAINT "schedule_weeks_play_date_in_range"
      CHECK ("play_date" >= "start_date" AND "play_date" <= "end_date");
  END IF;
END $$;
--> statement-breakpoint
WITH numbered_days AS (
  SELECT season_id, schedule_week AS week_number,
         (scheduled_at AT TIME ZONE 'America/Chicago')::date AS day
  FROM games
  WHERE schedule_week IS NOT NULL
  UNION ALL
  SELECT season_id, schedule_week, play_date
  FROM team_byes
)
INSERT INTO schedule_weeks (
  season_id, week_number, play_date, start_date, end_date
)
SELECT season_id,
       week_number,
       min(day),
       date_trunc('week', min(day)::timestamp)::date,
       (date_trunc('week', max(day)::timestamp) + interval '6 days')::date
FROM numbered_days
GROUP BY season_id, week_number
ON CONFLICT (season_id, week_number) DO NOTHING;
--> statement-breakpoint
UPDATE games AS g
SET schedule_week_id = sw.id
FROM schedule_weeks AS sw
WHERE g.schedule_week IS NOT NULL
  AND sw.season_id = g.season_id
  AND sw.week_number = g.schedule_week
  AND g.schedule_week_id IS NULL;
--> statement-breakpoint
UPDATE team_byes AS b
SET schedule_week_id = sw.id
FROM schedule_weeks AS sw
WHERE sw.season_id = b.season_id
  AND sw.week_number = b.schedule_week
  AND b.schedule_week_id IS NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'games_schedule_week_season_fk'
      AND conrelid = 'games'::regclass
  ) THEN
    ALTER TABLE "games"
      ADD CONSTRAINT "games_schedule_week_season_fk"
      FOREIGN KEY ("schedule_week_id", "season_id")
      REFERENCES "public"."schedule_weeks"("id", "season_id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_byes_schedule_week_season_fk'
      AND conrelid = 'team_byes'::regclass
  ) THEN
    ALTER TABLE "team_byes"
      ADD CONSTRAINT "team_byes_schedule_week_season_fk"
      FOREIGN KEY ("schedule_week_id", "season_id")
      REFERENCES "public"."schedule_weeks"("id", "season_id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;