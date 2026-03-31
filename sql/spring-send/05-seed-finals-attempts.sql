with finalist_pool as (
  select
    c.*,
    ef.qualifier_rank,
    greatest(1, 11 - ef.qualifier_rank) as qualifier_bonus,
    1 + ((c.climber_number::int * 103) % 7) as finals_attack,
    1 + ((c.climber_number::int * 107) % 7) as finals_precision
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
      when 2 then 14
      when 3 then 13
      else 16
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
      + ((athlete_number * 109 + climb_number * 113) % 11)
      >= problem_difficulty + 2
    ) as top,
    (
      qualifier_bonus
      + finals_attack
      + ((athlete_number * 127 + climb_number * 131) % 9)
      >= problem_difficulty - 2
    ) as zone,
    1 + ((athlete_number * 137 + climb_number * 139 + finals_precision * 149) % 6) as raw_top_attempts,
    1 + ((athlete_number * 151 + climb_number * 157 + finals_attack * 163) % 8) as raw_zone_attempts
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
    when rows.top then rows.raw_top_attempts
    else null
  end,
  case
    when rows.top or rows.zone
      then case when rows.top then least(rows.raw_zone_attempts, rows.raw_top_attempts) else rows.raw_zone_attempts end
    else null
  end,
  'staff'
from final_attempt_rows rows;
