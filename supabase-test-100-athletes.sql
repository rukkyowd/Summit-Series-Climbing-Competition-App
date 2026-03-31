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
  '100 Athlete Test Event',
  'scramble',
  'qualifier',
  20,
  150,
  6,
  8,
  true,
  '["Open"]'::jsonb,
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
),
athlete_profiles as (
  select
    climbers.id,
    climbers.climber_number::int as athlete_number,
    6 + ((climbers.climber_number::int * 11) % 13) as strength_band,
    1 + ((climbers.climber_number::int * 5) % 4) as endurance_band,
    (climbers.climber_number::int * 3) % 6 as volatility_band
  from inserted_climbers climbers
),
qualifier_attempt_seed as (
  select
    profiles.id as climber_id,
    profiles.athlete_number,
    profiles.strength_band,
    profiles.endurance_band,
    profiles.volatility_band,
    climbs.climb_number,
    least(20, 9 + ((profiles.athlete_number * 7) % 12)) as max_logged_climb,
    profiles.strength_band + ((profiles.athlete_number + climbs.climb_number * 3) % 6) as success_score,
    6 + floor((climbs.climb_number - 1) / 3.0)::int + ((climbs.climb_number + profiles.volatility_band) % 4) as difficulty_score
  from athlete_profiles profiles
  cross join generate_series(1, 20) as climbs(climb_number)
),
qualifier_attempt_rows as (
  select
    climber_id,
    climb_number,
    success_score >= difficulty_score as topped,
    case
      when success_score >= difficulty_score
        then 1 + ((athlete_number * (climb_number + 2) + volatility_band) % (2 + least(2, endurance_band)))
      else 1 + ((athlete_number + climb_number + endurance_band) % (3 + (volatility_band % 3)))
    end as attempt_count,
    case
      when climb_number <= 8 or ((athlete_number + climb_number) % 2 = 0) then 'climber'
      else 'staff'
    end as entered_by
  from qualifier_attempt_seed
  where climb_number <= max_logged_climb
    and not (climb_number > 15 and ((athlete_number + climb_number) % 4) = 0)
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
  rows.climber_id,
  rows.climb_number,
  rows.attempt_count,
  rows.topped,
  rows.entered_by
from qualifier_attempt_rows rows;

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
  cross join config
  where gender_division in ('Men', 'Women')
    and exists (
      select 1
      from jsonb_array_elements_text(config.finals_eligible_age_groups) as eligible(age_group)
      where eligible.age_group = qualifier_leaderboard_view.age_group
    )
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

with finalist_pool as (
  select
    c.*,
    ef.qualifier_rank,
    greatest(1, 11 - ef.qualifier_rank) as qualifier_bonus,
    1 + ((c.climber_number::int * 7) % 4) as finals_attack,
    1 + ((c.climber_number::int * 13) % 4) as finals_precision
  from public.climbers c
  join public.event_finalists ef on ef.climber_id = c.id
),
final_attempt_seed as (
  select
    finalists.id as climber_id,
    climbs.climb_number,
    finalists.climber_number::int as athlete_number,
    finalists.qualifier_bonus,
    finalists.finals_attack,
    finalists.finals_precision,
    case climbs.climb_number
      when 1 then 11
      when 2 then 13
      when 3 then 12
      else 14
    end as problem_difficulty
  from finalist_pool finalists
  cross join (values (1), (2), (3), (4)) as climbs(climb_number)
),
final_attempt_rows as (
  select
    climber_id,
    climb_number,
    (
      qualifier_bonus
      + finals_precision
      + ((athlete_number + climb_number * 5) % 7)
      >= problem_difficulty + 1
    ) as top,
    (
      qualifier_bonus
      + finals_attack
      + ((athlete_number * (climb_number + 1)) % 6)
      >= problem_difficulty - 2
    ) as zone,
    1 + ((athlete_number + climb_number + finals_precision) % 4) as raw_top_attempts,
    1 + ((athlete_number * 2 + climb_number + finals_attack) % 5) as raw_zone_attempts
  from final_attempt_seed
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
  rows.climber_id,
  rows.climb_number,
  rows.top,
  rows.top or rows.zone,
  case
    when rows.top
      then rows.raw_top_attempts
    else null
  end,
  case
    when rows.top or rows.zone
      then case when rows.top then least(rows.raw_zone_attempts, rows.raw_top_attempts) else rows.raw_zone_attempts end
    else null
  end,
  'staff'
from final_attempt_rows rows;
