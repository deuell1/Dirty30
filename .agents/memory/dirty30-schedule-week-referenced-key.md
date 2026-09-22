---
name: Dirty-30 schedule-week referenced key
description: Composite schedule-week foreign keys require an explicit referenced unique constraint across environments.
---

Use an explicit `UNIQUE (id, season_id)` constraint for the schedule-week composite foreign-key target. A matching unique index may exist in some environments but can be missing or represented inconsistently during production schema reconciliation.

**Why:** Production migration drift caused the `games` and `team_byes` composite foreign keys to fail even though the development schema had a same-column index.

**How to apply:** Keep `games(schedule_week_id, season_id)` and `team_byes(schedule_week_id, season_id)` referencing `schedule_weeks(id, season_id)`, and make forward migrations promote the legacy index or create the unique constraint without changing schedule data.