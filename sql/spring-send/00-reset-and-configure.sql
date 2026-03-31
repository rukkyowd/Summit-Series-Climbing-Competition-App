insert into public.active_event_config (
  id,
  name,
  format,
  stage_mode,
  total_climbs,
  max_climbers,
  qualifier_counting_climbs,
  finals_cutoff,
  finals_tie_advances,
  finals_eligible_age_groups,
  qualifier_locked_at,
  finals_started_at,
  finals_problem_count
)
values (
  1,
  'Spring Send',
  'scramble',
  'qualifier',
  20,
  150,
  6,
  8,
  true,
  '["Youth D","Youth B","Youth A","Junior"]'::jsonb,
  null,
  null,
  4
)
on conflict (id) do update
set
  name = excluded.name,
  format = excluded.format,
  stage_mode = excluded.stage_mode,
  total_climbs = excluded.total_climbs,
  max_climbers = excluded.max_climbers,
  qualifier_counting_climbs = excluded.qualifier_counting_climbs,
  finals_cutoff = excluded.finals_cutoff,
  finals_tie_advances = excluded.finals_tie_advances,
  finals_eligible_age_groups = excluded.finals_eligible_age_groups,
  qualifier_locked_at = excluded.qualifier_locked_at,
  finals_started_at = excluded.finals_started_at,
  finals_problem_count = excluded.finals_problem_count;

delete from public.final_attempts;
delete from public.event_finalists;
delete from public.qualifier_attempts;
delete from public.climbers;
delete from public.event_time_slots;
delete from public.event_categories;
