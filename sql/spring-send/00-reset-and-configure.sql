do $$
begin
  if to_regclass('public.competitions') is null then
    raise exception 'Missing multi-competition schema. Run supabase-repair.sql or supabase-schema.sql first.';
  end if;

  if to_regclass('public.final_attempts') is not null then
    execute 'delete from public.final_attempts';
  end if;
  if to_regclass('public.competition_finalists') is not null then
    execute 'delete from public.competition_finalists';
  end if;
  if to_regclass('public.qualifier_attempts') is not null then
    execute 'delete from public.qualifier_attempts';
  end if;
  if to_regclass('public.climbers') is not null then
    execute 'delete from public.climbers';
  end if;
  if to_regclass('public.competition_schedule_blocks') is not null then
    execute 'delete from public.competition_schedule_blocks';
  end if;
  if to_regclass('public.competition_categories') is not null then
    execute 'delete from public.competition_categories';
  end if;

  execute 'delete from public.competitions';
end $$;

insert into public.competitions (
  id,
  slug,
  name,
  status,
  format,
  discipline_label,
  stage_mode,
  location_name,
  start_date,
  end_date,
  registration_opens_at,
  registration_closes_at,
  description,
  total_climbs,
  max_climbers,
  qualifier_counting_climbs,
  finals_cutoff,
  finals_tie_advances,
  finals_eligible_age_groups
)
values
  (
    gen_random_uuid(),
    'spring-send-recreational',
    'Spring Send Recreational Scramble',
    'active',
    'scramble',
    'Boulder',
    'qualifier',
    'Halifax',
    current_date,
    current_date,
    now(),
    now() + interval '8 hours',
    'Recreational scramble competition.',
    20,
    80,
    6,
    6,
    true,
    '["Open"]'::jsonb
  ),
  (
    gen_random_uuid(),
    'spring-send-youth-competitive',
    'Spring Send Youth Competitive',
    'active',
    'five_on_five_off',
    'Boulder',
    'qualifier',
    'Halifax',
    current_date,
    current_date,
    now(),
    now() + interval '12 hours',
    'Youth competitive qualifier and finals competition.',
    20,
    120,
    6,
    8,
    true,
    '["Youth D","Youth B","Youth A","Junior"]'::jsonb
  );

insert into public.competition_categories (
  id,
  competition_id,
  gender_division,
  age_group,
  display_name,
  sort_order
)
select
  division || '::' || age_group,
  competitions.id,
  division,
  age_group,
  division || ' / ' || age_group,
  row_number() over (partition by competitions.id order by division, age_group) - 1
from public.competitions competitions
cross join (values ('Men'), ('Women'), ('X')) as divisions(division)
cross join (values ('Youth D'), ('Youth C'), ('Youth B'), ('Youth A'), ('Junior'), ('Rec'), ('Masters'), ('Open')) as ages(age_group);
