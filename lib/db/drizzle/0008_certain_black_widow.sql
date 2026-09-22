-- Promote the existing referenced-key index to an explicit UNIQUE constraint.
-- Some databases already have the index from migration 0006/0007, while a
-- partially reconciled database may have neither object. Keep both cases
-- forward-only and do not touch schedule or game data.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.schedule_weeks'::regclass
      AND constraint_row.contype = 'u'
      AND constraint_row.conkey = ARRAY[
        (
          SELECT attribute.attnum
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = 'public.schedule_weeks'::regclass
            AND attribute.attname = 'id'
        ),
        (
          SELECT attribute.attnum
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = 'public.schedule_weeks'::regclass
            AND attribute.attname = 'season_id'
        )
      ]::smallint[]
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_index AS index_row
      WHERE index_row.indexrelid = to_regclass(
        'public.schedule_weeks_id_season'
      )
        AND index_row.indisunique
        AND index_row.indpred IS NULL
    ) THEN
      ALTER TABLE "schedule_weeks"
        ADD CONSTRAINT "schedule_weeks_id_season_unique"
        UNIQUE USING INDEX "schedule_weeks_id_season";
    ELSE
      ALTER TABLE "schedule_weeks"
        ADD CONSTRAINT "schedule_weeks_id_season_unique"
        UNIQUE ("id", "season_id");
    END IF;
  END IF;
END $$;