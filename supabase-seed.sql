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
  qualifier_locked_at,
  finals_started_at,
  finals_problem_count
)
values (
  1,
  'Spring Boulder Jam',
  'scramble',
  'qualifier',
  12,
  48,
  6,
  6,
  true,
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
  qualifier_locked_at = excluded.qualifier_locked_at,
  finals_started_at = excluded.finals_started_at,
  finals_problem_count = excluded.finals_problem_count;

delete from public.final_attempts;
delete from public.event_finalists;
delete from public.qualifier_attempts;
delete from public.climbers;
delete from public.event_time_slots;
delete from public.event_categories;

with inserted_categories as (
  insert into public.event_categories (display_name, gender_division, age_group, sort_order)
  values
    ('Women / Open', 'Women', 'Open', 0),
    ('Men / Open', 'Men', 'Open', 1),
    ('Youth / Open', 'Youth', 'Open', 2)
  returning id, display_name
),
inserted_slots as (
  insert into public.event_time_slots (label, start_time, end_time, capacity, eligible_category_ids)
  select 'Morning session', '09:00', '11:00', 18, '[]'::jsonb
  union all
  select 'Afternoon session', '13:00', '15:00', 18, '[]'::jsonb
  returning id, label
),
seed_climbers as (
  insert into public.climbers (
    name,
    climber_number,
    province,
    category_id,
    gender_division,
    age_group,
    display_category,
    time_slot_id,
    access_token
  )
  select
    seed.name,
    seed.climber_number,
    seed.province,
    categories.id,
    split_part(categories.display_name, ' / ', 1),
    split_part(categories.display_name, ' / ', 2),
    categories.display_name,
    slots.id,
    seed.access_token
  from (
    values
      ('Ava Stone', '101', 'NB', 'Women / Open', 'Morning session', 'ava-private-link'),
      ('Noah Cruz', '102', 'NS', 'Men / Open', 'Morning session', 'noah-private-link'),
      ('Mia Chen', '103', 'PE', 'Women / Open', 'Afternoon session', 'mia-private-link'),
      ('Luca Roy', '104', 'QC', 'Men / Open', 'Afternoon session', 'luca-private-link'),
      ('Kai Reid', '105', 'NB', 'Youth / Open', 'Afternoon session', 'kai-private-link')
  ) as seed(name, climber_number, province, category_name, slot_name, access_token)
  join inserted_categories categories on categories.display_name = seed.category_name
  join inserted_slots slots on slots.label = seed.slot_name
  returning id, climber_number
)
insert into public.qualifier_attempts (climber_id, climb_number, attempt_count, topped, entered_by)
select seed.id, data.climb_number, data.attempt_count, data.topped, 'staff'
from seed_climbers seed
join (
  values
    ('101', 12, 1, true),
    ('101', 11, 2, true),
    ('101', 10, 2, true),
    ('101', 9, 1, true),
    ('101', 8, 2, true),
    ('101', 7, 1, true),
    ('102', 12, 2, true),
    ('102', 11, 1, true),
    ('102', 10, 2, true),
    ('102', 9, 2, true),
    ('102', 8, 1, true),
    ('102', 6, 1, true),
    ('103', 11, 1, true),
    ('103', 10, 1, true),
    ('103', 9, 2, true),
    ('103', 8, 3, true),
    ('103', 7, 2, true),
    ('103', 5, 1, true),
    ('104', 12, 1, true),
    ('104', 10, 1, true),
    ('104', 9, 2, true),
    ('104', 8, 1, true),
    ('104', 7, 2, true),
    ('104', 6, 2, true),
    ('105', 9, 1, true),
    ('105', 8, 2, true),
    ('105', 7, 1, true),
    ('105', 6, 2, true),
    ('105', 5, 1, true),
    ('105', 4, 1, true)
) as data(climber_number, climb_number, attempt_count, topped)
  on data.climber_number = seed.climber_number;

insert into public.event_finalists (
  event_id,
  climber_id,
  name,
  category_id,
  display_category,
  gender_division,
  age_group,
  qualifier_rank,
  advanced_with_tie
)
with config as (
  select *
  from public.active_event_config
  where id = 1
),
ranked as (
  select *
  from public.qualifier_leaderboard_view
  where age_group = 'Open'
    and gender_division in ('Men', 'Women')
),
cutoff as (
  select
    ranked.category_id,
    ranked.total_score,
    ranked.topped_count,
    ranked.counting_attempt_total
  from ranked
  cross join config
  where ranked.category_row_number = config.finals_cutoff
)
select
  1,
  ranked.climber_id,
  ranked.name,
  ranked.category_id,
  ranked.display_category,
  ranked.gender_division,
  ranked.age_group,
  ranked.category_rank,
  ranked.category_row_number > config.finals_cutoff
from ranked
cross join config
left join cutoff using (category_id)
where ranked.category_row_number <= config.finals_cutoff
   or (
     config.finals_tie_advances
     and cutoff.category_id is not null
     and ranked.category_row_number > config.finals_cutoff
     and ranked.total_score = cutoff.total_score
     and ranked.topped_count = cutoff.topped_count
     and ranked.counting_attempt_total = cutoff.counting_attempt_total
   );

update public.active_event_config
set
  format = 'ifsc_finals_format',
  stage_mode = 'finals',
  qualifier_locked_at = now(),
  finals_started_at = now(),
  finals_problem_count = 4
where id = 1;

insert into public.final_attempts (climber_id, climb_number, top, zone, attempts_to_top, attempts_to_zone, entered_by)
select seed.id, data.climb_number, data.top, data.zone, data.attempts_to_top, data.attempts_to_zone, 'staff'
from seed_climbers seed
join (
  values
    ('101', 1, true, true, 1, 1),
    ('101', 2, false, true, null, 2),
    ('102', 1, true, true, 2, 1),
    ('102', 2, true, true, 1, 1),
    ('103', 1, false, true, null, 1),
    ('103', 2, false, true, null, 2),
    ('104', 1, true, true, 1, 1),
    ('104', 2, false, true, null, 1),
    ('105', 1, false, true, null, 1)
) as data(climber_number, climb_number, top, zone, attempts_to_top, attempts_to_zone)
  on data.climber_number = seed.climber_number;
