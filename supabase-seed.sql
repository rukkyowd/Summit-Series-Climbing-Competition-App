-- ============================================================
-- SAMPLE DATA FOR LEADERBOARD TESTING
-- Run this in the Supabase SQL Editor after the main schema.
-- ============================================================

insert into public.competition_settings (id, penalty_per_fail, max_penalized_fails)
values (1, 200, 3)
on conflict (id) do update
set penalty_per_fail = excluded.penalty_per_fail,
    max_penalized_fails = excluded.max_penalized_fails;

insert into public.climbers (id, name, climber_number, category)
values
  ('00000000-0000-0000-0000-000000000101', 'Alex Stone', '101', 'Open'),
  ('00000000-0000-0000-0000-000000000102', 'Maya Brooks', '102', 'Open'),
  ('00000000-0000-0000-0000-000000000103', 'Jordan Peak', '103', 'Open'),
  ('00000000-0000-0000-0000-000000000104', 'Riley North', '104', 'Open'),
  ('00000000-0000-0000-0000-000000000105', 'Casey Flint', '105', 'Open'),
  ('00000000-0000-0000-0000-000000000106', 'Taylor Ridge', '106', 'Open'),
  ('00000000-0000-0000-0000-000000000107', 'Morgan Vale', '107', 'Open'),
  ('00000000-0000-0000-0000-000000000108', 'Sam Ember', '108', 'Open'),
  ('00000000-0000-0000-0000-000000000109', 'Jamie Slate', '109', 'Open'),
  ('00000000-0000-0000-0000-000000000110', 'Avery Summit', '110', 'Open')
on conflict (climber_number) do update
set name = excluded.name,
    category = excluded.category;

insert into public.climb_attempts (
  climber_id,
  climb_number,
  failed_attempts,
  completed,
  completion_time_seconds,
  started_at,
  completed_at
)
values
  ('00000000-0000-0000-0000-000000000101', 1, 0, true, 42, now() - interval '3 hours', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-000000000101', 2, 1, true, 53, now() - interval '2 hours 58 minutes', now() - interval '2 hours 58 minutes'),
  ('00000000-0000-0000-0000-000000000101', 3, 2, true, 61, now() - interval '2 hours 54 minutes', now() - interval '2 hours 54 minutes'),
  ('00000000-0000-0000-0000-000000000101', 4, 0, true, 74, now() - interval '2 hours 49 minutes', now() - interval '2 hours 49 minutes'),
  ('00000000-0000-0000-0000-000000000101', 5, 1, true, 88, now() - interval '2 hours 42 minutes', now() - interval '2 hours 42 minutes'),

  ('00000000-0000-0000-0000-000000000102', 1, 0, true, 39, now() - interval '3 hours', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-000000000102', 2, 0, true, 51, now() - interval '2 hours 57 minutes', now() - interval '2 hours 57 minutes'),
  ('00000000-0000-0000-0000-000000000102', 3, 1, true, 58, now() - interval '2 hours 52 minutes', now() - interval '2 hours 52 minutes'),
  ('00000000-0000-0000-0000-000000000102', 4, 2, true, 79, now() - interval '2 hours 45 minutes', now() - interval '2 hours 45 minutes'),

  ('00000000-0000-0000-0000-000000000103', 1, 1, true, 47, now() - interval '3 hours', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-000000000103', 2, 1, true, 55, now() - interval '2 hours 58 minutes', now() - interval '2 hours 58 minutes'),
  ('00000000-0000-0000-0000-000000000103', 3, 1, true, 69, now() - interval '2 hours 54 minutes', now() - interval '2 hours 54 minutes'),
  ('00000000-0000-0000-0000-000000000103', 4, 3, true, 83, now() - interval '2 hours 48 minutes', now() - interval '2 hours 48 minutes'),

  ('00000000-0000-0000-0000-000000000104', 1, 0, true, 44, now() - interval '3 hours', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-000000000104', 2, 2, true, 64, now() - interval '2 hours 57 minutes', now() - interval '2 hours 57 minutes'),
  ('00000000-0000-0000-0000-000000000104', 3, 0, true, 57, now() - interval '2 hours 53 minutes', now() - interval '2 hours 53 minutes'),

  ('00000000-0000-0000-0000-000000000105', 1, 0, true, 41, now() - interval '3 hours', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-000000000105', 2, 1, true, 49, now() - interval '2 hours 58 minutes', now() - interval '2 hours 58 minutes'),
  ('00000000-0000-0000-0000-000000000105', 3, 0, true, 56, now() - interval '2 hours 54 minutes', now() - interval '2 hours 54 minutes'),
  ('00000000-0000-0000-0000-000000000105', 4, 0, true, 71, now() - interval '2 hours 47 minutes', now() - interval '2 hours 47 minutes'),
  ('00000000-0000-0000-0000-000000000105', 5, 2, true, 93, now() - interval '2 hours 39 minutes', now() - interval '2 hours 39 minutes'),
  ('00000000-0000-0000-0000-000000000105', 6, 2, true, 104, now() - interval '2 hours 31 minutes', now() - interval '2 hours 31 minutes'),

  ('00000000-0000-0000-0000-000000000106', 1, 1, true, 48, now() - interval '3 hours', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-000000000106', 2, 0, true, 52, now() - interval '2 hours 57 minutes', now() - interval '2 hours 57 minutes'),
  ('00000000-0000-0000-0000-000000000106', 3, 2, true, 72, now() - interval '2 hours 52 minutes', now() - interval '2 hours 52 minutes'),

  ('00000000-0000-0000-0000-000000000107', 1, 0, true, 40, now() - interval '3 hours', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-000000000107', 2, 0, true, 54, now() - interval '2 hours 58 minutes', now() - interval '2 hours 58 minutes'),
  ('00000000-0000-0000-0000-000000000107', 3, 3, true, 77, now() - interval '2 hours 52 minutes', now() - interval '2 hours 52 minutes'),
  ('00000000-0000-0000-0000-000000000107', 4, 4, false, null, now() - interval '2 hours 44 minutes', null),

  ('00000000-0000-0000-0000-000000000108', 1, 2, true, 59, now() - interval '3 hours', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-000000000108', 2, 2, true, 66, now() - interval '2 hours 57 minutes', now() - interval '2 hours 57 minutes'),
  ('00000000-0000-0000-0000-000000000108', 3, 2, true, 73, now() - interval '2 hours 52 minutes', now() - interval '2 hours 52 minutes'),

  ('00000000-0000-0000-0000-000000000109', 1, 0, true, 43, now() - interval '3 hours', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-000000000109', 2, 1, true, 50, now() - interval '2 hours 58 minutes', now() - interval '2 hours 58 minutes'),
  ('00000000-0000-0000-0000-000000000109', 3, 1, true, 63, now() - interval '2 hours 54 minutes', now() - interval '2 hours 54 minutes'),
  ('00000000-0000-0000-0000-000000000109', 4, 1, true, 78, now() - interval '2 hours 47 minutes', now() - interval '2 hours 47 minutes'),

  ('00000000-0000-0000-0000-000000000110', 1, 3, true, 62, now() - interval '3 hours', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-000000000110', 2, 1, true, 57, now() - interval '2 hours 57 minutes', now() - interval '2 hours 57 minutes')
on conflict (climber_id, climb_number) do update
set failed_attempts = excluded.failed_attempts,
    completed = excluded.completed,
    completion_time_seconds = excluded.completion_time_seconds,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at;
