# Spring Send SQL Run Order

These scripts split the full Spring Send test event into the main day-of phases.

## Run order

1. [00-reset-and-configure.sql](/Users/Paul/Desktop/Scorecard/sql/spring-send/00-reset-and-configure.sql)
   - resets event data
   - sets the active event to `Spring Send`

2. [01-load-schedule.sql](/Users/Paul/Desktop/Scorecard/sql/spring-send/01-load-schedule.sql)
   - loads the full posted day-of schedule
   - starts with `Recreational Scramble` as the live block

3. [02-seed-registrations.sql](/Users/Paul/Desktop/Scorecard/sql/spring-send/02-seed-registrations.sql)
   - inserts 100 climbers
   - routes `Rec` athletes into the recreational scramble check-in block
   - routes everyone else into the youth competitive qualifier check-in block

4. [03-seed-qualifier-attempts.sql](/Users/Paul/Desktop/Scorecard/sql/spring-send/03-seed-qualifier-attempts.sql)
   - inserts qualifier attempts only

5. [04-advance-to-finals.sql](/Users/Paul/Desktop/Scorecard/sql/spring-send/04-advance-to-finals.sql)
   - snapshots finalists
   - switches the active event into finals mode
   - marks `Event - Youth Competitive Finals` as the live schedule block

6. [05-seed-finals-attempts.sql](/Users/Paul/Desktop/Scorecard/sql/spring-send/05-seed-finals-attempts.sql)
   - inserts finals attempts for the finalists

## Notes

- Finals advancement now follows the event's configured finals age groups across Men and Women divisions.
- The Spring Send setup script enables `Youth D`, `Youth B`, `Youth A`, and `Junior` for finals, which leaves `Youth C` out.
- If you want a different finals age-group mix, update [00-reset-and-configure.sql](/Users/Paul/Desktop/Scorecard/sql/spring-send/00-reset-and-configure.sql) or use the admin setup screen after loading the event.
