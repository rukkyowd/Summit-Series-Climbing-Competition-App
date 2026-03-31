insert into public.active_event_config (
  id,
  name,
  format,
  total_climbs,
  max_climbers,
  qualifier_counting_climbs,
  finals_cutoff,
  finals_tie_advances
)
values (
  1,
  '100 Athlete Test Event',
  'ifsc_finals_format',
  20,
  150,
  6,
  8,
  true
)
on conflict (id) do update
set
  name = excluded.name,
  format = excluded.format,
  total_climbs = excluded.total_climbs,
  max_climbers = excluded.max_climbers,
  qualifier_counting_climbs = excluded.qualifier_counting_climbs,
  finals_cutoff = excluded.finals_cutoff,
  finals_tie_advances = excluded.finals_tie_advances;

delete from public.final_attempts;
delete from public.qualifier_attempts;
delete from public.climbers;
delete from public.event_time_slots;
delete from public.event_categories;

with slot_seed as (
  insert into public.event_time_slots (label, start_time, end_time, capacity, eligible_category_ids)
  values
    ('Morning session', '09:00', '11:00', 40, '[]'::jsonb),
    ('Midday session', '11:30', '13:30', 35, '[]'::jsonb),
    ('Afternoon session', '14:00', '16:00', 35, '[]'::jsonb)
  returning id, label
),
division_seed as (
  select *
  from (values ('Men'), ('Women'), ('X')) as divisions(gender_division)
),
age_seed as (
  select *
  from (
    values
      ('Youth D'),
      ('Youth C'),
      ('Youth B'),
      ('Youth A'),
      ('Junior'),
      ('Rec'),
      ('Masters'),
      ('Open')
  ) as ages(age_group)
),
category_grid as (
  select
    row_number() over (order by d.gender_division, a.age_group) as category_index,
    d.gender_division,
    a.age_group,
    d.gender_division || ' / ' || a.age_group as display_category
  from division_seed d
  cross join age_seed a
),
athlete_seed as (
  select
    athlete_number,
    case ((athlete_number - 1) % 10)
      when 0 then 'Alex'
      when 1 then 'Jordan'
      when 2 then 'Taylor'
      when 3 then 'Morgan'
      when 4 then 'Riley'
      when 5 then 'Casey'
      when 6 then 'Skyler'
      when 7 then 'Avery'
      when 8 then 'Quinn'
      else 'Parker'
    end || ' ' ||
    case ((athlete_number - 1) % 10)
      when 0 then 'Stone'
      when 1 then 'Reid'
      when 2 then 'Cruz'
      when 3 then 'Chen'
      when 4 then 'Roy'
      when 5 then 'Sato'
      when 6 then 'Lopez'
      when 7 then 'Singh'
      when 8 then 'Bennett'
      else 'Nguyen'
    end || ' ' || athlete_number as athlete_name,
    case ((athlete_number - 1) % 6)
      when 0 then 'NB'
      when 1 then 'NS'
      when 2 then 'PE'
      when 3 then 'QC'
      when 4 then 'ON'
      else 'NL'
    end as province,
    ((athlete_number - 1) % 24) + 1 as category_index,
    case
      when athlete_number <= 40 then 'Morning session'
      when athlete_number <= 75 then 'Midday session'
      else 'Afternoon session'
    end as slot_label
  from generate_series(1, 100) as athlete_number
),
inserted_climbers as (
  insert into public.climbers (
    event_id,
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
    1,
    athlete_seed.athlete_name,
    lpad(athlete_seed.athlete_number::text, 3, '0'),
    athlete_seed.province,
    null,
    category_grid.gender_division,
    category_grid.age_group,
    category_grid.display_category,
    slot_seed.id,
    'test-link-' || lpad(athlete_seed.athlete_number::text, 3, '0')
  from athlete_seed
  join category_grid on category_grid.category_index = athlete_seed.category_index
  join slot_seed on slot_seed.label = athlete_seed.slot_label
  returning id, climber_number
)
insert into public.qualifier_attempts (
  event_id,
  climber_id,
  climb_number,
  attempt_count,
  topped,
  entered_by
)
select
  1,
  climbers.id,
  climbs.climb_number,
  case
    when climbs.climb_number <= 6 + ((climbers.climber_number::int - 1) % 8)
      then 1 + ((climbers.climber_number::int + climbs.climb_number) % 4)
    else 1 + ((climbers.climber_number::int + climbs.climb_number) % 3)
  end,
  climbs.climb_number <= 6 + ((climbers.climber_number::int - 1) % 8),
  case when climbs.climb_number <= 10 then 'climber' else 'staff' end
from inserted_climbers climbers
cross join lateral (
  select generate_series(1, 12 + (climbers.climber_number::int % 5)) as climb_number
) climbs;

with finalist_pool as (
  select *
  from public.climbers
  where event_id = 1
    and climber_number::int <= 36
)
insert into public.final_attempts (
  event_id,
  climber_id,
  climb_number,
  top,
  zone,
  attempts_to_top,
  attempts_to_zone,
  entered_by
)
select
  1,
  finalists.id,
  climbs.climb_number,
  ((finalists.climber_number::int + climbs.climb_number) % 3) = 0,
  ((finalists.climber_number::int + climbs.climb_number) % 4) <> 0,
  case
    when ((finalists.climber_number::int + climbs.climb_number) % 3) = 0
      then 1 + ((finalists.climber_number::int + climbs.climb_number) % 3)
    else null
  end,
  case
    when ((finalists.climber_number::int + climbs.climb_number) % 4) <> 0
      then 1 + ((finalists.climber_number::int + climbs.climb_number) % 4)
    else null
  end,
  'staff'
from finalist_pool finalists
cross join (values (1), (2), (3), (4)) as climbs(climb_number);
