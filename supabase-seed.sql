delete from public.final_attempts;
delete from public.competition_finalists;
delete from public.qualifier_attempts;
delete from public.climbers;
delete from public.competition_schedule_blocks;
delete from public.competition_categories;
delete from public.competitions;

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
  hero_image_url,
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
    'Self-scored recreational scramble.',
    '',
    20,
    80,
    6,
    6,
    true,
    '["Open"]'::jsonb
  ),
  (
    gen_random_uuid(),
    'spring-send-youth',
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
    'Youth competitive qualifiers and finals.',
    '',
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

insert into public.competition_schedule_blocks (
  competition_id,
  label,
  phase_type,
  audience_label,
  is_active,
  start_time,
  end_time,
  capacity,
  eligible_category_ids
)
select
  id,
  case slug
    when 'spring-send-recreational' then 'Recreational scramble live'
    else 'Youth qualifiers live'
  end,
  'qualifier_round',
  case slug
    when 'spring-send-recreational' then 'Recreational'
    else 'Youth competitive'
  end,
  true,
  '09:00',
  '12:00',
  max_climbers,
  '[]'::jsonb
from public.competitions;
