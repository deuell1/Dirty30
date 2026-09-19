CREATE TABLE "schedule_weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"week_number" integer NOT NULL,
	"play_date" date NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_weeks_positive_week" CHECK ("schedule_weeks"."week_number" > 0),
	CONSTRAINT "schedule_weeks_valid_dates" CHECK ("schedule_weeks"."end_date" >= "schedule_weeks"."start_date"),
	CONSTRAINT "schedule_weeks_play_date_in_range" CHECK ("schedule_weeks"."play_date" >= "schedule_weeks"."start_date" AND "schedule_weeks"."play_date" <= "schedule_weeks"."end_date")
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "schedule_week_id" integer;--> statement-breakpoint
ALTER TABLE "team_byes" ADD COLUMN "schedule_week_id" integer;--> statement-breakpoint
ALTER TABLE "schedule_weeks" ADD CONSTRAINT "schedule_weeks_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_weeks_season_week" ON "schedule_weeks" USING btree ("season_id","week_number");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_weeks_id_season" ON "schedule_weeks" USING btree ("id","season_id");--> statement-breakpoint
CREATE INDEX "games_schedule_week_idx" ON "games" USING btree ("season_id","schedule_week_id");--> statement-breakpoint
CREATE INDEX "team_byes_schedule_week_idx" ON "team_byes" USING btree ("season_id","schedule_week_id");--> statement-breakpoint
-- Preserve the legacy week columns while creating one canonical range for every
-- season/week already represented by a game or bye.
WITH numbered_days AS (
  SELECT season_id, schedule_week AS week_number,
         (scheduled_at AT TIME ZONE 'America/Chicago')::date AS day
  FROM games
  WHERE schedule_week IS NOT NULL
  UNION ALL
  SELECT season_id, schedule_week, play_date
  FROM team_byes
)
INSERT INTO schedule_weeks (season_id, week_number, play_date, start_date, end_date)
SELECT season_id,
       week_number,
       min(day),
       date_trunc('week', min(day)::timestamp)::date,
       (date_trunc('week', max(day)::timestamp) + interval '6 days')::date
FROM numbered_days
GROUP BY season_id, week_number;--> statement-breakpoint
-- Numbered legacy rows map directly to their anchored canonical week.
UPDATE games AS g
SET schedule_week_id = sw.id
FROM schedule_weeks AS sw
WHERE g.schedule_week IS NOT NULL
  AND sw.season_id = g.season_id
  AND sw.week_number = g.schedule_week;--> statement-breakpoint
UPDATE team_byes AS b
SET schedule_week_id = sw.id
FROM schedule_weeks AS sw
WHERE sw.season_id = b.season_id
  AND sw.week_number = b.schedule_week;--> statement-breakpoint
-- A NULL-week game may attach to an anchored range only when that date has
-- exactly one candidate. Ambiguous and out-of-range dates become stable buckets.
UPDATE games AS g
SET schedule_week_id = candidates.id
FROM (
  SELECT g2.id AS game_id, min(sw.id) AS id
  FROM games AS g2
  JOIN schedule_weeks AS sw
    ON sw.season_id = g2.season_id
   AND (g2.scheduled_at AT TIME ZONE 'America/Chicago')::date
       BETWEEN sw.start_date AND sw.end_date
  WHERE g2.schedule_week IS NULL
  GROUP BY g2.id
  HAVING count(*) = 1
) AS candidates
WHERE g.id = candidates.game_id;--> statement-breakpoint
CREATE TEMP TABLE _schedule_week_game_days ON COMMIT DROP AS
SELECT DISTINCT
  g.season_id,
  date_trunc(
    'week',
    g.scheduled_at AT TIME ZONE 'America/Chicago'
  )::date AS start_date,
  min((g.scheduled_at AT TIME ZONE 'America/Chicago')::date)
    OVER (
      PARTITION BY
        g.season_id,
        date_trunc('week', g.scheduled_at AT TIME ZONE 'America/Chicago')::date
    ) AS play_date
FROM games AS g
WHERE g.schedule_week IS NULL
  AND g.schedule_week_id IS NULL;--> statement-breakpoint
WITH numbered_days AS (
  SELECT d.season_id, d.start_date, d.play_date,
         COALESCE(max(sw.week_number), 0)
           + row_number() OVER (
               PARTITION BY d.season_id ORDER BY d.start_date
             ) AS week_number
  FROM _schedule_week_game_days AS d
  LEFT JOIN schedule_weeks AS sw ON sw.season_id = d.season_id
  GROUP BY d.season_id, d.start_date, d.play_date
)
INSERT INTO schedule_weeks (season_id, week_number, play_date, start_date, end_date)
SELECT season_id,
       week_number,
       play_date,
       start_date,
       (start_date + 6)
FROM numbered_days;--> statement-breakpoint
UPDATE games AS g
SET schedule_week_id = sw.id
FROM schedule_weeks AS sw
WHERE g.schedule_week IS NULL
  AND g.schedule_week_id IS NULL
  AND sw.season_id = g.season_id
  AND sw.week_number > COALESCE((
    SELECT max(existing.week_number)
    FROM (
      SELECT schedule_week AS week_number, season_id
      FROM games
      WHERE schedule_week IS NOT NULL
      UNION ALL
      SELECT schedule_week, season_id
      FROM team_byes
    ) AS existing
    WHERE existing.season_id = g.season_id
  ), 0)
  AND sw.start_date = date_trunc(
    'week',
    g.scheduled_at AT TIME ZONE 'America/Chicago'
  )::date
  AND sw.end_date = sw.start_date + 6;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_schedule_week_season_fk" FOREIGN KEY ("schedule_week_id","season_id") REFERENCES "public"."schedule_weeks"("id","season_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_byes" ADD CONSTRAINT "team_byes_schedule_week_season_fk" FOREIGN KEY ("schedule_week_id","season_id") REFERENCES "public"."schedule_weeks"("id","season_id") ON DELETE restrict ON UPDATE no action;