# Spring Send SQL

These scripts seed Spring Send as two separate competitions:

- `spring-send-recreational`
- `spring-send-youth-competitive`

Run them in this order:

1. `00-reset-and-configure.sql`
2. `01-load-schedule.sql`
3. `02-seed-registrations.sql`
4. `03-seed-qualifier-attempts.sql`
5. `04-advance-to-finals.sql`
6. `05-seed-finals-attempts.sql`

Notes:

- `00-reset-and-configure.sql` now creates the Spring Send competitions, categories, and default schedule blocks in one shot.
- `01-load-schedule.sql` is safe to rerun if you want to refresh just the schedule block set.
- The recreational scramble stays in qualifier mode.
- The youth competition advances to finals separately.
- Finals eligibility is driven by the competition's `finals_eligible_age_groups` setting.
- These scripts assume the multi-competition schema from `supabase-schema.sql` is already applied.
- Registration, qualifier attempts, and finals attempts are intentionally seeded with much higher variation now:
  - larger name pool
  - broader province/category mix
  - assigned schedule blocks
  - uneven climb logging
  - more realistic top / no-top / zone-only spread
  - less repetitive leaderboard clustering
